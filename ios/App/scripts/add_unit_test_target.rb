#!/usr/bin/env ruby
# Idempotent script that wires the AppTests unit-test target into App.xcodeproj
# so the BytspotTrustEngineTests XCTest suite runs in CI (xcodebuild test), not
# only at app launch via the BYT_NATIVE_ROOT=1 precondition self-tests.
# Safe to re-run: skips work when the AppTests target already exists.
#
# Usage (run from ios/App):
#   bundle exec ruby scripts/add_unit_test_target.rb

require "xcodeproj"
require "pathname"

# Resolve paths relative to ios/App regardless of the caller's CWD.
APP_DIR           = File.expand_path("..", __dir__)
PROJECT_PATH      = File.join(APP_DIR, "App.xcodeproj")
APP_TARGET_NAME   = "App"
TEST_TARGET_NAME  = "AppTests"
TEST_BUNDLE_ID    = "com.bytspot.app.AppTests"
TEST_GROUP_PATH   = "AppTests"
TEST_SOURCES      = ["BytspotTrustEngineTests.swift"].freeze
DEPLOYMENT_TARGET = "15.0"

project = Xcodeproj::Project.open(PROJECT_PATH)
app_target = project.targets.find { |t| t.name == APP_TARGET_NAME }
abort "Main App target not found" unless app_target

# Inherit the host App's versions so the embedded test bundle stays consistent.
app_release_config = app_target.build_configurations.find { |c| c.name == "Release" } ||
                     app_target.build_configurations.first
inherited_marketing_version = app_release_config.build_settings["MARKETING_VERSION"] || "1.0"
inherited_project_version   = app_release_config.build_settings["CURRENT_PROJECT_VERSION"] || "1"

# Find-or-create so the scheme registration below always runs (it failed on a
# first pass under some REXML versions): target creation is the only step we skip
# when it already exists; every other step is independently idempotent.
test_target = project.targets.find { |t| t.name == TEST_TARGET_NAME }
if test_target
  puts "[unit-test-scaffold] AppTests target already exists — ensuring scheme registration only."
else
  test_group = project.main_group[TEST_GROUP_PATH] ||
               project.main_group.new_group(TEST_GROUP_PATH, TEST_GROUP_PATH)

  test_target = project.new_target(
    :unit_test_bundle,
    TEST_TARGET_NAME,
    :ios,
    DEPLOYMENT_TARGET,
    nil,
    :swift,
  )

  TEST_SOURCES.each do |filename|
    ref = test_group.files.find { |f| f.path == filename } ||
          test_group.new_reference(filename)
    test_target.source_build_phase.add_file_reference(ref, true)
  end

  # Host the tests on the App product so @testable import App resolves and the
  # suite runs inside the host app's process.
  test_host = "$(BUILT_PRODUCTS_DIR)/#{APP_TARGET_NAME}.app/#{APP_TARGET_NAME}"
  test_target.build_configurations.each do |config|
    bs = config.build_settings
    bs["PRODUCT_BUNDLE_IDENTIFIER"]  = TEST_BUNDLE_ID
    bs["PRODUCT_NAME"]               = "$(TARGET_NAME)"
    bs["IPHONEOS_DEPLOYMENT_TARGET"] = DEPLOYMENT_TARGET
    bs["TARGETED_DEVICE_FAMILY"]     = "1,2"
    bs["SWIFT_VERSION"]              = "5.0"
    bs["GENERATE_INFOPLIST_FILE"]    = "YES"
    bs["CODE_SIGN_STYLE"]            = "Automatic"
    bs["DEVELOPMENT_TEAM"]           = ENV["APPLE_TEAM_ID"] || ""
    bs["MARKETING_VERSION"]          = inherited_marketing_version
    bs["CURRENT_PROJECT_VERSION"]    = inherited_project_version
    bs["TEST_HOST"]                  = test_host
    bs["BUNDLE_LOADER"]              = "$(TEST_HOST)"
    bs["LD_RUNPATH_SEARCH_PATHS"]    = "$(inherited) @executable_path/Frameworks @loader_path/Frameworks"
  end

  # Build the host before the tests and link them as the test host's dependency.
  unless test_target.dependencies.any? { |d| d.target == app_target }
    test_target.add_dependency(app_target)
  end

  # @testable import App requires the host built with testability. The project-level
  # Debug config already sets ENABLE_TESTABILITY = YES; pin it on the App target's
  # Debug config too so the host is always testable regardless of inheritance.
  app_target.build_configurations.each do |config|
    next unless config.name == "Debug"
    config.build_settings["ENABLE_TESTABILITY"] = "YES"
  end

  project.save
  puts "[unit-test-scaffold] Added '#{TEST_TARGET_NAME}' target (#{TEST_BUNDLE_ID}) hosted on '#{APP_TARGET_NAME}'."
end

# Inject a TestableReference into the existing, hand-authored App scheme so
# `xcodebuild test -scheme App` runs the suite while preserving the scheme's
# Launch/Profile/Archive actions (load-from-file, then add-and-save).
scheme_dir  = File.join(PROJECT_PATH, "xcshareddata", "xcschemes")
scheme_path = File.join(scheme_dir, "#{APP_TARGET_NAME}.xcscheme")
if File.exist?(scheme_path)
  scheme = Xcodeproj::XCScheme.new(scheme_path)
  already = scheme.test_action.testables.any? do |t|
    t.buildable_references.any? { |r| r.target_name == TEST_TARGET_NAME }
  end
  unless already
    testable = Xcodeproj::XCScheme::TestAction::TestableReference.new(test_target)
    scheme.test_action.add_testable(testable)
    scheme.save!
    puts "[unit-test-scaffold] Registered '#{TEST_TARGET_NAME}' in the shared '#{APP_TARGET_NAME}' scheme TestAction."
  else
    puts "[unit-test-scaffold] '#{TEST_TARGET_NAME}' already present in the '#{APP_TARGET_NAME}' scheme — skipping scheme edit."
  end
else
  warn "[unit-test-scaffold] Shared scheme #{scheme_path} not found; create it in Xcode (Manage Schemes → Shared) so CI can run xcodebuild test -scheme #{APP_TARGET_NAME}."
end
