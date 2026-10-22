require 'minitest/autorun'
require 'cocoapods'
require 'digest'

ROOT = File.expand_path('../..', __dir__)
require File.join(ROOT, 'node_modules/react-native/scripts/react_native_pods')
Pod::Config.instance.installation_root = Pathname.new(File.join(ROOT, 'ios'))

class PodspecChecksumsTest < Minitest::Test
  SPECS = [
    'ReactCommon/yoga/Yoga.podspec',
    'sdks/hermes-engine/hermes-engine.podspec',
  ].map do |file|
    Pod::Specification.from_file(File.join(ROOT, 'node_modules/react-native', file))
  end.to_h { |spec| [spec.name, spec] }

  def test_lockfile_matches_generated_json_checksums
    checksums = YAML.safe_load(File.read(File.join(ROOT, 'ios/Podfile.lock'))).fetch('SPEC CHECKSUMS')
    SPECS.each do |name, spec|
      # CocoaPods hashes the generated JSON for local pods, not the Ruby source.
      assert_equal checksums.fetch(name), Digest::SHA1.hexdigest(spec.to_pretty_json), name
    end
  end

  def test_hermes_compiler_path_is_portable_and_resolves
    path = SPECS.fetch('hermes-engine').to_hash.fetch('user_target_xcconfig').fetch('HERMES_CLI_PATH')
    assert path.start_with?('$(PODS_ROOT)/'), path
    assert File.executable?(path.sub('$(PODS_ROOT)', File.join(ROOT, 'ios/Pods'))), path
  end

  def test_yoga_private_headers_have_stable_order
    headers = SPECS.fetch('Yoga').to_hash.fetch('private_header_files')
    refute_empty headers
    assert_equal headers.sort, headers
  end
end
