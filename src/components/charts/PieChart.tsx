/**
 * Tori Wallet - Pie Chart Component
 * 자산 배분 파이 차트
 */

import React from 'react';
import styled from 'styled-components/native';
import Svg, { G, Path, Circle } from 'react-native-svg';
import { AssetAllocation } from '@/services/portfolioAnalyticsService';

interface Props {
  data: AssetAllocation[];
  size?: number;
  innerRadius?: number;
  showLabels?: boolean;
}

// 안전한 숫자 검증 함수
const safeNumber = (value: number, fallback: number = 0): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return value;
};

export function PieChart({
  data,
  size = 200,
  innerRadius = 60,
  showLabels = true,
}: Props) {
  // 안전한 크기 값 보장
  const safeSize = Math.max(safeNumber(size, 200), 50);
  const safeInnerRadius = Math.max(safeNumber(innerRadius, 60), 0);

  const center = safeSize / 2;
  const radius = Math.max(safeSize / 2 - 10, 10);

  // 빈 데이터 또는 유효하지 않은 데이터 처리
  const hasValidData =
    data &&
    Array.isArray(data) &&
    data.length > 0 &&
    data.some(item => safeNumber(item.percentage, 0) > 0);

  // 개선된 Empty State 컴포넌트
  const renderEmptyState = () => (
    <Container
      style={{ width: safeSize, height: safeSize + (showLabels ? 100 : 0) }}
    >
      <Svg width={safeSize} height={safeSize}>
        {/* 외부 원 - 점선 스타일 */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          fill="#2A2A3C"
          stroke="#4A4A5C"
          strokeWidth={2}
          strokeDasharray="8,4"
        />
        {/* 내부 원 */}
        <Circle cx={center} cy={center} r={safeInnerRadius} fill="#1A1A2E" />
        {/* 플레이스홀더 조각들 (회색) */}
        {[0, 120, 200, 280].map((angle, index) => {
          const startRad = ((angle - 90) * Math.PI) / 180;
          const endRad = ((angle + 60 - 90) * Math.PI) / 180;
          const x1 = center + (radius - 5) * Math.cos(startRad);
          const y1 = center + (radius - 5) * Math.sin(startRad);
          const x2 = center + (radius - 5) * Math.cos(endRad);
          const y2 = center + (radius - 5) * Math.sin(endRad);
          return (
            <Path
              key={index}
              d={`M ${center} ${center} L ${x1} ${y1} A ${radius - 5} ${
                radius - 5
              } 0 0 1 ${x2} ${y2} Z`}
              fill={`rgba(100, 100, 120, ${0.15 - index * 0.03})`}
            />
          );
        })}
      </Svg>
      <CenterLabel
        style={{
          width: safeInnerRadius * 2 - 10,
          height: safeInnerRadius * 2 - 10,
          top: center - safeInnerRadius + 5,
          left: center - safeInnerRadius + 5,
        }}
      >
        <EmptyIcon>💰</EmptyIcon>
        <CenterSubtext>자산 없음</CenterSubtext>
      </CenterLabel>
      {showLabels && (
        <EmptyLegendContainer>
          <EmptyLegendText>
            토큰을 보유하면 자산 배분을{'\n'}확인할 수 있어요
          </EmptyLegendText>
        </EmptyLegendContainer>
      )}
    </Container>
  );

  if (!hasValidData) {
    return renderEmptyState();
  }

  // 유효한 데이터만 필터링하고 percentage 안전하게 처리
  const validData = data
    .filter(item => item && safeNumber(item.percentage, 0) > 0)
    .map(item => ({
      ...item,
      percentage: safeNumber(item.percentage, 0),
      value: safeNumber(item.value, 0),
    }));

  // 총 percentage가 0이면 빈 차트 표시
  const totalPercentage = validData.reduce(
    (sum, item) => sum + item.percentage,
    0,
  );
  if (totalPercentage <= 0) {
    return renderEmptyState();
  }

  // 파이 조각 경로 계산 (안전하게)
  const createArc = (
    startAngle: number,
    endAngle: number,
    outerR: number,
    innerR: number,
  ): string => {
    // 각도 검증
    const safeStartAngle = safeNumber(startAngle, 0);
    const safeEndAngle = safeNumber(endAngle, 0);
    const safeOuterR = Math.max(safeNumber(outerR, radius), 1);
    const safeInnerR = Math.max(safeNumber(innerR, safeInnerRadius), 0);

    // 각도 차이가 너무 작으면 스킵
    if (Math.abs(safeEndAngle - safeStartAngle) < 0.1) {
      return '';
    }

    const startAngleRad = (safeStartAngle - 90) * (Math.PI / 180);
    const endAngleRad = (safeEndAngle - 90) * (Math.PI / 180);

    const x1 = center + safeOuterR * Math.cos(startAngleRad);
    const y1 = center + safeOuterR * Math.sin(startAngleRad);
    const x2 = center + safeOuterR * Math.cos(endAngleRad);
    const y2 = center + safeOuterR * Math.sin(endAngleRad);
    const x3 = center + safeInnerR * Math.cos(endAngleRad);
    const y3 = center + safeInnerR * Math.sin(endAngleRad);
    const x4 = center + safeInnerR * Math.cos(startAngleRad);
    const y4 = center + safeInnerR * Math.sin(startAngleRad);

    // 모든 좌표 검증
    const coords = [x1, y1, x2, y2, x3, y3, x4, y4];
    if (coords.some(c => !Number.isFinite(c))) {
      return '';
    }

    const largeArc = safeEndAngle - safeStartAngle > 180 ? 1 : 0;

    return `
      M ${x1.toFixed(2)} ${y1.toFixed(2)}
      A ${safeOuterR.toFixed(2)} ${safeOuterR.toFixed(
      2,
    )} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}
      L ${x3.toFixed(2)} ${y3.toFixed(2)}
      A ${safeInnerR.toFixed(2)} ${safeInnerR.toFixed(
      2,
    )} 0 ${largeArc} 0 ${x4.toFixed(2)} ${y4.toFixed(2)}
      Z
    `;
  };

  // 각 조각의 시작/끝 각도 계산
  let currentAngle = 0;
  const slices = validData.map(item => {
    // percentage를 totalPercentage 기준으로 정규화
    const normalizedPercentage = (item.percentage / totalPercentage) * 100;
    const angle = (normalizedPercentage / 100) * 360;
    const slice = {
      ...item,
      startAngle: currentAngle,
      endAngle: currentAngle + angle,
    };
    currentAngle += angle;
    return slice;
  });

  const totalValue = validData.reduce((sum, item) => sum + item.value, 0);

  return (
    <Container
      style={{ width: safeSize, height: safeSize + (showLabels ? 120 : 0) }}
    >
      <Svg width={safeSize} height={safeSize}>
        <G>
          {slices.map((slice, index) => {
            const path = createArc(
              slice.startAngle,
              slice.endAngle,
              radius,
              safeInnerRadius,
            );
            // 빈 경로는 렌더링하지 않음
            if (!path || path.trim() === '') {
              return null;
            }
            return <Path key={index} d={path} fill={slice.color || '#666'} />;
          })}
        </G>
      </Svg>

      <CenterLabel
        style={{
          width: safeInnerRadius * 2 - 10,
          height: safeInnerRadius * 2 - 10,
          top: center - safeInnerRadius + 5,
          left: center - safeInnerRadius + 5,
        }}
      >
        <CenterAmount>
          $
          {safeNumber(totalValue, 0).toLocaleString('en-US', {
            maximumFractionDigits: 0,
          })}
        </CenterAmount>
        <CenterSubtext>총 자산</CenterSubtext>
      </CenterLabel>

      {showLabels && (
        <LegendContainer>
          {validData.slice(0, 5).map((item, index) => (
            <LegendItem key={index}>
              <LegendDot style={{ backgroundColor: item.color || '#666' }} />
              <LegendText>{item.symbol || 'Unknown'}</LegendText>
              <LegendPercentage>
                {safeNumber(item.percentage, 0).toFixed(1)}%
              </LegendPercentage>
            </LegendItem>
          ))}
          {validData.length > 5 && (
            <LegendItem>
              <LegendDot style={{ backgroundColor: '#666' }} />
              <LegendText>기타</LegendText>
              <LegendPercentage>
                {validData
                  .slice(5)
                  .reduce((sum, i) => sum + safeNumber(i.percentage, 0), 0)
                  .toFixed(1)}
                %
              </LegendPercentage>
            </LegendItem>
          )}
        </LegendContainer>
      )}
    </Container>
  );
}

const Container = styled.View`
  align-items: center;
`;

const CenterLabel = styled.View`
  position: absolute;
  justify-content: center;
  align-items: center;
`;

const CenterAmount = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 18px;
  font-weight: bold;
`;

const CenterSubtext = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 12px;
`;

const EmptyIcon = styled.Text`
  font-size: 24px;
  margin-bottom: 4px;
`;

const EmptyLegendContainer = styled.View`
  margin-top: ${({ theme }) => theme.spacing.md}px;
  padding: ${({ theme }) => theme.spacing.sm}px
    ${({ theme }) => theme.spacing.md}px;
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
`;

const EmptyLegendText = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 13px;
  text-align: center;
  line-height: 20px;
`;

const LegendContainer = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: center;
  margin-top: ${({ theme }) => theme.spacing.md}px;
  gap: 8px;
`;

const LegendItem = styled.View`
  flex-direction: row;
  align-items: center;
  background-color: ${({ theme }) => theme.colors.surface};
  padding: ${({ theme }) => theme.spacing.xs}px
    ${({ theme }) => theme.spacing.sm}px;
  border-radius: ${({ theme }) => theme.borderRadius.sm}px;
`;

const LegendDot = styled.View`
  width: 10px;
  height: 10px;
  border-radius: 5px;
  margin-right: ${({ theme }) => theme.spacing.xs}px;
`;

const LegendText = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 12px;
  font-weight: 600;
  margin-right: ${({ theme }) => theme.spacing.xs}px;
`;

const LegendPercentage = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 12px;
`;

export default PieChart;
