require 'minitest/autorun'
require_relative '../scripts/deployment_targets'

class DeploymentTargetsTest < Minitest::Test
  Config = Struct.new(:build_settings)
  Target = Struct.new(:build_configurations)
  Project = Struct.new(:targets)

  def project(*versions)
    Project.new(versions.map do |version|
      Target.new([Config.new({ 'IPHONEOS_DEPLOYMENT_TARGET' => version })])
    end)
  end

  def versions(project)
    project.targets.flat_map(&:build_configurations).map do |config|
      config.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
    end
  end

  def test_old_resource_bundle_targets_are_raised_to_the_app_minimum
    pods = project('9.0', '12.4', '13.4', nil)
    raise_ios_deployment_targets(pods, '15.1')
    assert_equal ['15.1'] * 4, versions(pods)
  end

  def test_higher_targets_are_preserved_and_versions_are_compared_numerically
    pods = project('15.1', '15.10', '18.0')
    raise_ios_deployment_targets(pods, '15.2')
    assert_equal ['15.2', '15.10', '18.0'], versions(pods)
  end

  def test_every_build_configuration_is_adjusted_and_rerunning_is_safe
    pods = Project.new([Target.new([
      Config.new({ 'IPHONEOS_DEPLOYMENT_TARGET' => '12.0' }),
      Config.new({ 'IPHONEOS_DEPLOYMENT_TARGET' => '13.0' })
    ])])
    2.times { raise_ios_deployment_targets(pods, '15.1') }
    assert_equal ['15.1', '15.1'], versions(pods)
  end

  def test_xcode_setting_expressions_are_preserved
    pods = project('$(inherited)')
    raise_ios_deployment_targets(pods, '15.1')
    assert_equal ['$(inherited)'], versions(pods)
  end
end
