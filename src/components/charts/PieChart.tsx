/**
 * 자산 배분 도넛 차트
 *
 * 한 자산이 100%면 0°→360° 호는 시작점과 끝점이 같아 아무것도 그려지지 않으므로
 * 원(stroke)으로 전체 고리를 그린다.
 */

import React from 'react';
import styled, { useTheme } from 'styled-components/native';
import Svg, { G, Path, Circle } from 'react-native-svg';
import { AssetAllocation } from '@/services/portfolioAnalyticsService';
import { useFiat } from '@/hooks/useFiat';

interface Props {
  data: AssetAllocation[];
  size?: number;
  innerRadius?: number;
  showLabels?: boolean;
  testID?: string;
}

// 안전한 숫자 검증 함수
const safeNumber = (value: number, fallback: number = 0): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return value;
};

/** 이 각도 이상이면 호 대신 전체 고리를 그린다 */
const FULL_CIRCLE_THRESHOLD = 359.99;

export function PieChart({
  data,
  size = 200,
  innerRadius = 60,
  showLabels = true,
  testID = 'pie-chart',
}: Props) {
  const theme = useTheme();
  const { formatFiat } = useFiat();

  const safeSize = Math.max(safeNumber(size, 200), 50);
  const center = safeSize / 2;
  const radius = Math.max(safeSize / 2 - 10, 10);
  const safeInnerRadius = Math.min(
    Math.max(safeNumber(innerRadius, 60), 0),
    radius - 1,
  );

  const validData = (Array.isArray(data) ? data : [])
    .filter(item => item && safeNumber(item.percentage, 0) > 0)
    .map(item => ({
      ...item,
      percentage: safeNumber(item.percentage, 0),
      value: safeNumber(item.value, 0),
    }));

  const totalPercentage = validData.reduce(
    (sum, item) => sum + item.percentage,
    0,
  );

  const centerLabelStyle = {
    width: Math.max(safeInnerRadius * 2 - 10, 0),
    height: Math.max(safeInnerRadius * 2 - 10, 0),
    top: center - safeInnerRadius + 5,
    left: center - safeInnerRadius + 5,
  };

  if (validData.length === 0 || totalPercentage <= 0) {
    return (
      <Container
        style={{ width: safeSize, height: safeSize + (showLabels ? 100 : 0) }}
        testID={`${testID}-empty`}
        accessible
        accessibilityLabel="자산 배분, 가치를 확인할 수 있는 자산이 없습니다"
      >
        <Svg width={safeSize} height={safeSize}>
          <Circle
            cx={center}
            cy={center}
            r={(radius + safeInnerRadius) / 2}
            stroke={theme.colors.chartGrid}
            strokeWidth={radius - safeInnerRadius}
            strokeDasharray="8,4"
            fill="none"
          />
        </Svg>
        <CenterLabel style={centerLabelStyle}>
          <CenterSubtext>자산 없음</CenterSubtext>
        </CenterLabel>
        {showLabels && (
          <EmptyLegendContainer>
            <EmptyLegendText>
              가치를 확인할 수 있는 토큰을 보유하면{'\n'}자산 배분이 표시됩니다
            </EmptyLegendText>
          </EmptyLegendContainer>
        )}
      </Container>
    );
  }

  const createArc = (startAngle: number, endAngle: number): string => {
    if (Math.abs(endAngle - startAngle) < 0.1) return '';

    const startRad = (startAngle - 90) * (Math.PI / 180);
    const endRad = (endAngle - 90) * (Math.PI / 180);
    const x1 = center + radius * Math.cos(startRad);
    const y1 = center + radius * Math.sin(startRad);
    const x2 = center + radius * Math.cos(endRad);
    const y2 = center + radius * Math.sin(endRad);
    const x3 = center + safeInnerRadius * Math.cos(endRad);
    const y3 = center + safeInnerRadius * Math.sin(endRad);
    const x4 = center + safeInnerRadius * Math.cos(startRad);
    const y4 = center + safeInnerRadius * Math.sin(startRad);

    if ([x1, y1, x2, y2, x3, y3, x4, y4].some(c => !Number.isFinite(c))) {
      return '';
    }

    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    const r = radius.toFixed(2);
    const ir = safeInnerRadius.toFixed(2);
    return [
      `M ${x1.toFixed(2)} ${y1.toFixed(2)}`,
      `A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`,
      `L ${x3.toFixed(2)} ${y3.toFixed(2)}`,
      `A ${ir} ${ir} 0 ${largeArc} 0 ${x4.toFixed(2)} ${y4.toFixed(2)}`,
      'Z',
    ].join(' ');
  };

  let currentAngle = 0;
  const slices = validData.map(item => {
    const angle = (item.percentage / totalPercentage) * 360;
    const slice = {
      ...item,
      startAngle: currentAngle,
      endAngle: currentAngle + angle,
      sweep: angle,
    };
    currentAngle += angle;
    return slice;
  });

  const totalValue = validData.reduce((sum, item) => sum + item.value, 0);
  const otherColor = theme.colors.textMuted;
  const summary = `자산 배분, 총 ${formatFiat(totalValue)}, ${validData
    .map(
      item =>
        `${item.symbol || '알 수 없음'} ${(
          (item.percentage / totalPercentage) *
          100
        ).toFixed(1)}%`,
    )
    .join(', ')}`;

  return (
    <Container
      style={{ width: safeSize, height: safeSize + (showLabels ? 120 : 0) }}
      testID={testID}
      accessible
      accessibilityRole="image"
      accessibilityLabel={summary}
    >
      <Svg width={safeSize} height={safeSize}>
        <G>
          {slices.map((slice, index) => {
            const fill = slice.color || otherColor;
            if (slice.sweep >= FULL_CIRCLE_THRESHOLD) {
              // 단일 자산 100%: 전체 고리
              return (
                <Circle
                  key={index}
                  testID={`${testID}-full-ring`}
                  cx={center}
                  cy={center}
                  r={(radius + safeInnerRadius) / 2}
                  stroke={fill}
                  strokeWidth={radius - safeInnerRadius}
                  fill="none"
                />
              );
            }
            const path = createArc(slice.startAngle, slice.endAngle);
            if (!path) return null;
            return <Path key={index} d={path} fill={fill} />;
          })}
        </G>
      </Svg>

      <CenterLabel style={centerLabelStyle}>
        <CenterAmount numberOfLines={1} adjustsFontSizeToFit>
          {formatFiat(totalValue, { compact: true })}
        </CenterAmount>
        <CenterSubtext>총 자산</CenterSubtext>
      </CenterLabel>

      {showLabels && (
        <LegendContainer>
          {validData.slice(0, 5).map((item, index) => (
            <LegendItem key={index}>
              <LegendDot $color={item.color || otherColor} />
              <LegendText>{item.symbol || '알 수 없음'}</LegendText>
              <LegendPercentage>
                {((item.percentage / totalPercentage) * 100).toFixed(1)}%
              </LegendPercentage>
            </LegendItem>
          ))}
          {validData.length > 5 && (
            <LegendItem>
              <LegendDot $color={otherColor} />
              <LegendText>기타</LegendText>
              <LegendPercentage>
                {(
                  (validData
                    .slice(5)
                    .reduce((sum, i) => sum + i.percentage, 0) /
                    totalPercentage) *
                  100
                ).toFixed(1)}
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

const EmptyLegendContainer = styled.View`
  margin-top: ${({ theme }) => theme.spacing.md}px;
  padding: ${({ theme }) => theme.spacing.sm}px
    ${({ theme }) => theme.spacing.md}px;
  background-color: ${({ theme }) => theme.colors.backgroundSecondary};
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
  background-color: ${({ theme }) => theme.colors.backgroundSecondary};
  padding: ${({ theme }) => theme.spacing.xs}px
    ${({ theme }) => theme.spacing.sm}px;
  border-radius: ${({ theme }) => theme.borderRadius.sm}px;
`;

const LegendDot = styled.View<{ $color: string }>`
  width: 10px;
  height: 10px;
  border-radius: 5px;
  margin-right: ${({ theme }) => theme.spacing.xs}px;
  background-color: ${({ $color }) => $color};
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
