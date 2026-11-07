/**
 * 거래 상세 화면 (구현 예정 자리 표시자)
 */

import React from 'react';
import { Screen } from '@/components/common/Screen';
import { ScreenHeader } from '@/components/common/ScreenHeader';

export default function TransactionDetailScreen(): React.JSX.Element {
  return (
    <Screen testID="TransactionDetail-screen">
      <ScreenHeader title="거래 상세" />
    </Screen>
  );
}
