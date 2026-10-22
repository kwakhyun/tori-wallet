# CocoaPods resource bundle targets can retain a pod's obsolete iOS minimum,
# even after React Native adjusts the library targets. Xcode 27 rejects these.
def raise_ios_deployment_targets(project, minimum)
  minimum_version = Gem::Version.new(minimum)
  project.targets.each do |target|
    target.build_configurations.each do |config|
      current = config.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
      next if current && !Gem::Version.correct?(current.to_s)
      next if current && Gem::Version.new(current.to_s) >= minimum_version

      config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = minimum
    end
  end
end
