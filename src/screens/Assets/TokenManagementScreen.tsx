/**
 * 토큰 관리 화면 (구현 예정 자리 표시자)
 */

import React from 'react';
import { Screen } from '@/components/common/Screen';
import { ScreenHeader } from '@/components/common/ScreenHeader';

export default function TokenManagementScreen(): React.JSX.Element {
  return (
    <Screen testID="TokenManagement-screen">
      <ScreenHeader title="토큰 관리" />
    </Screen>
  );
}
