Pod::Spec.new do |s|
  s.name         = "story-composer"
  s.version      = "0.0.3"
  s.summary      = "Native video composer for ActivityPal"
  s.license      = { :type => "MIT" }
  s.author       = { "ActivityPal" => "dev@activitypal.local" }
  s.homepage     = "https://example.com/story-composer"
  s.platforms    = { :ios => "13.0" }
  s.source       = { :path => "." }

  s.source_files = "ios/**/*.{h,m,mm,swift}"
  s.requires_arc = true
  s.swift_version = "5.0"

  # Only this is needed for a plain RCTBridgeModule
  s.dependency "React-Core"
end
