#!/usr/bin/env ruby
# Idempotent script that wires the App Clip target into App.xcodeproj.
# Safe to re-run: skips work when the Clip target is already present.
#
# Usage (run from ios/App):
#   bundle exec ruby scripts/add_app_clip_target.rb

require "xcodeproj"
require "pathname"

PROJECT_PATH      = "App.xcodeproj"
APP_TARGET_NAME   = "App"
CLIP_TARGET_NAME  = "Clip"
CLIP_BUNDLE_ID    = "com.bytspot.app.Clip"
CLIP_GROUP_PATH   = "Clip"
CLIP_SOURCES      = ["ClipApp.swift", "ClipContentView.swift", "ClipPatchVerifier.swift"].freeze
CLIP_INFO_PLIST   = "Clip/Info.plist"
CLIP_ENTITLEMENTS = "Clip/Clip.entitlements"
DEPLOYMENT_TARGET = "15.0"

project = Xcodeproj::Project.open(PROJECT_PATH)
app_target = project.targets.find { |t| t.name == APP_TARGET_NAME }
abort "Main App target not found" unless app_target

if project.targets.any? { |t| t.name == CLIP_TARGET_NAME }
  puts "[clip-scaffold] Clip target already exists — skipping."
  exit 0
end

clip_group = project.main_group[CLIP_GROUP_PATH] ||
             project.main_group.new_group(CLIP_GROUP_PATH, CLIP_GROUP_PATH)

clip_target = project.new_target(
  :application,
  CLIP_TARGET_NAME,
  :ios,
  DEPLOYMENT_TARGET,
  nil,
  :swift,
)
clip_target.product_type = "com.apple.product-type.application.on-demand-install-capable"

CLIP_SOURCES.each do |filename|
  ref = clip_group.files.find { |f| f.path == filename } ||
        clip_group.new_reference(filename)
  clip_target.source_build_phase.add_file_reference(ref, true)
end

[CLIP_INFO_PLIST.split("/").last, CLIP_ENTITLEMENTS.split("/").last].each do |filename|
  next if clip_group.files.any? { |f| f.path == filename }
  clip_group.new_reference(filename)
end

clip_target.build_configurations.each do |config|
  bs = config.build_settings
  bs["PRODUCT_BUNDLE_IDENTIFIER"]      = CLIP_BUNDLE_ID
  bs["PRODUCT_NAME"]                   = "$(TARGET_NAME)"
  bs["INFOPLIST_FILE"]                 = CLIP_INFO_PLIST
  bs["CODE_SIGN_ENTITLEMENTS"]         = CLIP_ENTITLEMENTS
  bs["IPHONEOS_DEPLOYMENT_TARGET"]     = DEPLOYMENT_TARGET
  bs["TARGETED_DEVICE_FAMILY"]         = "1,2"
  bs["SWIFT_VERSION"]                  = "5.0"
  bs["ENABLE_BITCODE"]                 = "NO"
  bs["CODE_SIGN_STYLE"]                = "Manual"
  bs["DEVELOPMENT_TEAM"]               = ENV["APPLE_TEAM_ID"] || ""
  bs["MARKETING_VERSION"]              = "1.0"
  bs["CURRENT_PROJECT_VERSION"]        = "1"
  bs["ASSETCATALOG_COMPILER_APPICON_NAME"] = "AppIcon"
  bs["LD_RUNPATH_SEARCH_PATHS"]        = "$(inherited) @executable_path/Frameworks"
  if config.name == "Release"
    bs["PROVISIONING_PROFILE_SPECIFIER"] = ENV["APP_CLIP_PROVISIONING_PROFILE_SPECIFIER"] || "Bytspot Clip App Store"
    bs["CODE_SIGN_IDENTITY"]             = "Apple Distribution"
  end
end

embed_phase_name = "Embed App Clips"
embed_phase = app_target.copy_files_build_phases.find { |p| p.name == embed_phase_name }
unless embed_phase
  embed_phase = app_target.new_copy_files_build_phase(embed_phase_name)
  embed_phase.dst_subfolder_spec = "16" # App Clips destination
  embed_phase.dst_path = "$(CONTENTS_FOLDER_PATH)/AppClips"
  embed_phase.run_only_for_deployment_postprocessing = "0"
end

product_ref = clip_target.product_reference
unless embed_phase.files_references.include?(product_ref)
  build_file = embed_phase.add_file_reference(product_ref, true)
  build_file.settings = { "ATTRIBUTES" => ["RemoveHeadersOnCopy"] }
end

unless app_target.dependencies.any? { |d| d.target == clip_target }
  app_target.add_dependency(clip_target)
end

project.save
puts "[clip-scaffold] Added '#{CLIP_TARGET_NAME}' target with bundle id #{CLIP_BUNDLE_ID}."
