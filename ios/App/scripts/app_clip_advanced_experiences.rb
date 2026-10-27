# frozen_string_literal: true

# Lists, and with `apply` creates, the App Clip's advanced experiences in App
# Store Connect. The default experience (title, subtitle, header image) is what
# iOS shows for every link with no more specific experience, so without one
# for https://bytspot.app/sale a Private Sale link showed the Party Pass card.
#
#   bundle exec ruby scripts/app_clip_advanced_experiences.rb list
#   bundle exec ruby scripts/app_clip_advanced_experiences.rb apply
#
# Needs APP_STORE_CONNECT_KEY_ID, APP_STORE_CONNECT_ISSUER_ID and
# APP_STORE_CONNECT_KEY_CONTENT. `apply` skips any link that already has an
# experience, so it is safe to re-run.

require "digest"
require "json"
require "net/http"
require "spaceship"
require "uri"

API = "https://api.appstoreconnect.apple.com"
APP_BUNDLE_ID = "com.bytspot.app"
CLIP_BUNDLE_ID = "com.bytspot.app.Clip"
ASSET_DIR = File.expand_path("../fastlane/app_clip_advanced_experiences", __dir__)

EXPERIENCES = [
  {
    link: "https://bytspot.app/sale",
    action: "VIEW",
    title: "Private Sale",
    subtitle: "See the item and ask the seller to meet",
    header_image: "sale-header.png",
  },
].freeze

def env!(name)
  value = ENV[name].to_s.strip
  abort("#{name} is required") if value.empty?
  value
end

def token
  @token ||= Spaceship::ConnectAPI::Token.create(
    key_id: env!("APP_STORE_CONNECT_KEY_ID"),
    issuer_id: env!("APP_STORE_CONNECT_ISSUER_ID"),
    key: env!("APP_STORE_CONNECT_KEY_CONTENT"),
  )
end

def request(method, path, body = nil)
  uri = URI(path.start_with?("http") ? path : "#{API}#{path}")
  req = Net::HTTP.const_get(method.capitalize).new(uri)
  req["Authorization"] = "Bearer #{token.text}"
  req["Content-Type"] = "application/json"
  req.body = JSON.generate(body) if body
  res = Net::HTTP.start(uri.host, uri.port, use_ssl: true) { |http| http.request(req) }
  unless res.is_a?(Net::HTTPSuccess)
    errors = (JSON.parse(res.body)["errors"] rescue nil) || res.body
    abort("#{method.upcase} #{uri.path} failed (#{res.code}): #{errors.to_json}")
  end
  res.body.to_s.empty? ? {} : JSON.parse(res.body)
end

def clip_id
  app = request(:get, "/v1/apps?filter[bundleId]=#{APP_BUNDLE_ID}")["data"].first or abort("App #{APP_BUNDLE_ID} not found")
  clips = request(:get, "/v1/apps/#{app['id']}/appClips")["data"]
  clip = clips.find { |c| c.dig("attributes", "bundleId") == CLIP_BUNDLE_ID } or abort("App Clip #{CLIP_BUNDLE_ID} not found")
  clip["id"]
end

def existing_experiences(clip)
  body = request(:get, "/v1/appClips/#{clip}/appClipAdvancedExperiences?include=localizations&limit=200")
  locs = (body["included"] || []).select { |i| i["type"] == "appClipAdvancedExperienceLocalizations" }.to_h { |l| [l["id"], l["attributes"]] }
  body["data"].map do |exp|
    titles = (exp.dig("relationships", "localizations", "data") || []).map { |r| locs.dig(r["id"], "title") }.compact
    exp["attributes"].merge("id" => exp["id"], "titles" => titles)
  end
end

def upload_header_image(file_name)
  path = File.join(ASSET_DIR, file_name)
  bytes = File.binread(path)
  image = request(:post, "/v1/appClipAdvancedExperienceImages", {
    data: { type: "appClipAdvancedExperienceImages", attributes: { fileName: file_name, fileSize: bytes.bytesize } },
  })["data"]

  image.dig("attributes", "uploadOperations").each do |op|
    uri = URI(op["url"])
    req = Net::HTTP.const_get(op["method"].capitalize).new(uri)
    (op["requestHeaders"] || []).each { |h| req[h["name"]] = h["value"] }
    req.body = bytes.byteslice(op["offset"], op["length"])
    res = Net::HTTP.start(uri.host, uri.port, use_ssl: true) { |http| http.request(req) }
    next if res.is_a?(Net::HTTPSuccess)
    if res.code == "409"
      warn "Header image part already stored (409); Apple's processing check below confirms it"
      next
    end
    abort("Header image upload failed (#{res.code}): #{res.body.to_s[0, 500]}")
  end

  request(:patch, "/v1/appClipAdvancedExperienceImages/#{image['id']}", {
    data: { type: "appClipAdvancedExperienceImages", id: image["id"],
            attributes: { uploaded: true, sourceFileChecksum: Digest::MD5.hexdigest(bytes) } },
  })

  30.times do
    state = request(:get, "/v1/appClipAdvancedExperienceImages/#{image['id']}").dig("data", "attributes", "assetDeliveryState") || {}
    return image["id"] if state["state"] == "COMPLETE"
    abort("Header image rejected: #{state['errors'].to_json}") if state["state"] == "FAILED"
    sleep 5
  end
  abort("Header image was not processed in time")
end

def create_experience(clip, spec)
  image_id = upload_header_image(spec[:header_image])
  local_id = "${loc-en}"
  request(:post, "/v1/appClipAdvancedExperiences", {
    data: {
      type: "appClipAdvancedExperiences",
      attributes: { link: spec[:link], action: spec[:action], isPoweredBy: false, defaultLanguage: "EN" },
      relationships: {
        appClip: { data: { type: "appClips", id: clip } },
        headerImage: { data: { type: "appClipAdvancedExperienceImages", id: image_id } },
        localizations: { data: [{ type: "appClipAdvancedExperienceLocalizations", id: local_id }] },
      },
    },
    included: [{
      type: "appClipAdvancedExperienceLocalizations", id: local_id,
      attributes: { language: "EN", title: spec[:title], subtitle: spec[:subtitle] },
    }],
  })["data"]
end

mode = ARGV.first
abort("usage: app_clip_advanced_experiences.rb list|apply") unless %w[list apply].include?(mode)

clip = clip_id
existing = existing_experiences(clip)
puts "App Clip #{CLIP_BUNDLE_ID}: #{existing.size} advanced experience(s)"
existing.each { |e| puts "  #{e['link']}  status=#{e['status']}  action=#{e['action']}  titles=#{e['titles'].join(' | ')}" }
exit if mode == "list"

EXPERIENCES.each do |spec|
  if existing.any? { |e| e["link"] == spec[:link] && !e["removed"] }
    puts "Skip #{spec[:link]}: already configured"
    next
  end
  created = create_experience(clip, spec)
  puts "Created #{spec[:link]}  status=#{created.dig('attributes', 'status')}"
end
