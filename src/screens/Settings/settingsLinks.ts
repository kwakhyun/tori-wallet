/**
 * 설정 화면 외부 링크 (문의, 개인정보 처리방침, 이용약관)
 */

import { Alert, Linking, Platform } from 'react-native';
import { APP_VERSION } from '@/config/appInfo';

export const SUPPORT_EMAIL = 'khyun9685@gmail.com';

// GitHub Pages나 자체 도메인으로 옮기면 이 경로만 바꾼다.
const DOCS_BASE_URL = 'https://github.com/kwakhyun/tori-wallet/blob/main/docs';

export type LegalDocument = 'privacy' | 'terms';
export type LegalLanguage = 'ko' | 'en';

const LEGAL_FILES: Record<LegalDocument, Record<LegalLanguage, string>> = {
  privacy: { ko: 'PRIVACY_POLICY.md', en: 'PRIVACY_POLICY_EN.md' },
  terms: { ko: 'TERMS_OF_SERVICE.md', en: 'TERMS_OF_SERVICE_EN.md' },
};

export const LEGAL_TITLES: Record<LegalDocument, string> = {
  privacy: '개인정보 처리방침',
  terms: '이용약관',
};

export function legalDocumentUrl(
  document: LegalDocument,
  language: LegalLanguage,
): string {
  return `${DOCS_BASE_URL}/${LEGAL_FILES[document][language]}`;
}

function openUrl(url: string) {
  Linking.openURL(url).catch(() => {
    Alert.alert('링크를 열 수 없습니다', url);
  });
}

/** 한국어/English 중 선택해 문서를 연다 (Android Alert 버튼 3개 제한 내) */
export function openLegalDocument(document: LegalDocument): void {
  Alert.alert(LEGAL_TITLES[document], '문서 언어를 선택하세요.', [
    {
      text: '한국어',
      onPress: () => openUrl(legalDocumentUrl(document, 'ko')),
    },
    {
      text: 'English',
      onPress: () => openUrl(legalDocumentUrl(document, 'en')),
    },
    { text: '취소', style: 'cancel' },
  ]);
}

export function openSupportEmail(): void {
  const subject = encodeURIComponent('[Tori Wallet] 문의');
  const body = encodeURIComponent(
    `\n\n---\n앱 버전: ${APP_VERSION}\n기기 정보: ${Platform.OS} ${Platform.Version}`,
  );
  Linking.openURL(
    `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`,
  ).catch(() => {
    Alert.alert(
      '이메일 앱을 열 수 없습니다',
      `아래 주소로 문의해주세요.\n\n${SUPPORT_EMAIL}`,
    );
  });
}
