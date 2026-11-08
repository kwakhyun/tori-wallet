/**
 * 설정 화면에서 여는 개인정보 처리방침이 실제 설정 항목 이름을 안내하는지 확인한다.
 * (iOS는 앱 삭제 후에도 Keychain이 남을 수 있어 문서가 삭제 항목을 정확히 가리켜야 한다)
 */

import fs from 'fs';
import path from 'path';

const projectRoot = path.resolve(__dirname, '../..');
const read = (relative: string) =>
  fs.readFileSync(path.join(projectRoot, relative), 'utf8');

const DELETE_LABEL = '지갑 완전 삭제';
const SECTION_LABEL = '위험 영역';

describe('privacy policy deletion instructions', () => {
  const settingsSource = read('src/screens/Settings/SettingsScreen.tsx');

  it('matches the labels the Settings screen actually shows', () => {
    expect(settingsSource).toContain(`title="${DELETE_LABEL}"`);
    expect(settingsSource).toContain(
      `<SectionTitle>${SECTION_LABEL}</SectionTitle>`,
    );
  });

  it.each(['docs/PRIVACY_POLICY.md', 'docs/PRIVACY_POLICY_EN.md'])(
    '%s points to the current delete item',
    file => {
      const text = read(file);
      expect(text).toContain(`"${DELETE_LABEL}"`);
      expect(text).toContain(SECTION_LABEL);
      // 더 이상 설정에 없는 항목 이름
      expect(text).not.toContain('"지갑 초기화"');
      expect(text).not.toContain('Reset Wallet');
    },
  );
});
