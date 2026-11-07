/**
 * 토큰 승인 관리 화면 (구현 예정 자리 표시자)
 */

import React from 'react';
import { Screen } from '@/components/common/Screen';
import { ScreenHeader } from '@/components/common/ScreenHeader';

export default function TokenApprovalsScreen(): React.JSX.Element {
  return (
    <Screen testID="TokenApprovals-screen">
      <ScreenHeader title="토큰 승인 관리" />
    </Screen>
  );
}
