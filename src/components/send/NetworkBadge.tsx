/**
 * 현재 네트워크 표시 배지 (메인넷: 빨강 점, 테스트넷: 초록 점)
 */

import React from 'react';
import styled from 'styled-components/native';

interface Props {
  name?: string;
  isTestnet?: boolean;
  /** 앞에 붙는 설명 (예: "네트워크") */
  label?: string;
  testID?: string;
}

export function NetworkBadge({
  name,
  isTestnet,
  label,
  testID = 'network-badge',
}: Props): React.JSX.Element {
  const networkName = name || '알 수 없는 네트워크';
  const kind = isTestnet ? '테스트넷' : '메인넷';
  return (
    <Badge
      testID={testID}
      accessible
      accessibilityLabel={`${label ? `${label} ` : ''}${networkName}, ${kind}`}
    >
      <Dot $isMainnet={!isTestnet} />
      {label ? <Label>{label}</Label> : null}
      <Name numberOfLines={1}>{networkName}</Name>
      {isTestnet ? <Tag>테스트넷</Tag> : null}
    </Badge>
  );
}

const Badge = styled.View`
  flex-direction: row;
  align-items: center;
  align-self: center;
  background-color: ${({ theme }) => theme.colors.backgroundSecondary};
  border: 1px solid ${({ theme }) => theme.colors.border};
  padding: 6px ${({ theme }) => theme.spacing.md}px;
  border-radius: ${({ theme }) => theme.borderRadius.full}px;
  max-width: 100%;
`;

const Dot = styled.View<{ $isMainnet: boolean }>`
  width: 8px;
  height: 8px;
  border-radius: 4px;
  background-color: ${({ theme, $isMainnet }) =>
    $isMainnet ? theme.colors.error : theme.colors.success};
  margin-right: ${({ theme }) => theme.spacing.xs}px;
`;

const Label = styled.Text`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-right: ${({ theme }) => theme.spacing.xs}px;
`;

const Name = styled.Text`
  font-size: 13px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  flex-shrink: 1;
`;

const Tag = styled.Text`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-left: ${({ theme }) => theme.spacing.xs}px;
`;

export default NetworkBadge;
