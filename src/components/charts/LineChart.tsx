/**
 * 가치/가격 추이 라인 차트
 *
 * 색상은 모두 테마 토큰을 사용해 라이트/다크 모드 모두에서 읽힌다.
 * Y축 라벨은 표시 통화(useFiat) 압축 표기로, 서로 구분될 때까지 소수 자릿수를 늘린다.
 */

import React, { useId, useMemo } from 'react';
import styled, { useTheme } from 'styled-components/native';
import Svg, {
  Path,
  Line,
  Text as SvgText,
  Defs,
  LinearGradient,
  Stop,
  Circle,
} from 'react-native-svg';
import { useFiat } from '@/hooks/useFiat';

interface Props {
  labels: string[];
  values: number[];
  width?: number;
  height?: number;
  showLabels?: boolean;
  /** 기간 수익률 행 표시 여부 */
  showChange?: boolean;
  color?: string;
  gradientColor?: string;
  /** Y축/요약 라벨 포맷 (기본: 표시 통화 압축 표기) */
  formatValue?: (value: number, fractionDigits: number) => string;
  /** 화면 낭독기 요약 앞에 붙는 제목 (예: "포트폴리오 추이") */
  title?: string;
  accessibilityLabel?: string;
  emptyTitle?: string;
  emptyMessage?: string;
  testID?: string;
}

// 안전한 숫자 검증 함수
const safeNumber = (value: number, fallback: number = 0): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return value;
};

/** 라벨이 서로 구분될 때까지 소수 자릿수를 늘린다 (예: "$0 $0 $1" 방지) */
export function formatDistinctLabels(
  values: number[],
  format: (value: number, fractionDigits: number) => string,
  maxDigits = 6,
): string[] {
  let labels = values.map(v => format(v, 0));
  for (let digits = 1; digits <= maxDigits; digits++) {
    if (new Set(labels).size === labels.length) break;
    labels = values.map(v => format(v, digits));
  }
  return labels;
}

export function LineChart({
  labels,
  values,
  width = 320,
  height = 180,
  showLabels = true,
  showChange = true,
  color,
  gradientColor,
  formatValue,
  title = '추이',
  accessibilityLabel,
  emptyTitle = '아직 기록이 없어요',
  emptyMessage = '포트폴리오 탭을 열 때마다 하루 한 번 기록됩니다.',
  testID = 'line-chart',
}: Props) {
  const theme = useTheme();
  const { formatFiat } = useFiat();
  const gradientId = `lc${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  const lineColor = color ?? theme.colors.primary;
  const fillColor = gradientColor ?? lineColor;
  const gridColor = theme.colors.chartGrid;
  const labelColor = theme.colors.chartLabel;

  const format = useMemo(
    () =>
      formatValue ??
      ((value: number, digits: number) =>
        formatFiat(value, { compact: true, maximumFractionDigits: digits })),
    [formatValue, formatFiat],
  );

  // 안전한 크기 값 보장
  const safeWidth = safeNumber(width, 320);
  const safeHeight = safeNumber(height, 180);

  const padding = {
    top: 20,
    right: 10,
    bottom: showLabels ? 30 : 10,
    left: 56,
  };
  const chartWidth = Math.max(safeWidth - padding.left - padding.right, 1);
  const chartHeight = Math.max(safeHeight - padding.top - padding.bottom, 1);

  const validValues = (values || []).filter(v => Number.isFinite(v));
  const containerHeight = safeHeight + (showChange ? 40 : 0);

  // 빈 데이터 처리
  if (validValues.length === 0) {
    return (
      <Container
        style={{ width: safeWidth, height: containerHeight }}
        testID={`${testID}-empty`}
        accessible
        accessibilityLabel={`${title}, ${emptyTitle}. ${emptyMessage}`}
      >
        {showChange && (
          <ChangeRow>
            <ChangeLabel>기간 수익률</ChangeLabel>
            <ChangeValue $color={theme.colors.textSecondary}>—</ChangeValue>
          </ChangeRow>
        )}
        <EmptyStateContainer style={{ height: safeHeight }}>
          <Svg width={safeWidth} height={safeHeight}>
            {[0.25, 0.5, 0.75].map((ratio, index) => (
              <Line
                key={index}
                x1={padding.left}
                y1={padding.top + chartHeight * ratio}
                x2={safeWidth - padding.right}
                y2={padding.top + chartHeight * ratio}
                stroke={gridColor}
                strokeWidth={1}
                strokeDasharray="4,4"
              />
            ))}
          </Svg>
          <EmptyOverlay>
            <EmptyTitle>{emptyTitle}</EmptyTitle>
            {emptyMessage ? (
              <EmptyDescription>{emptyMessage}</EmptyDescription>
            ) : null}
          </EmptyOverlay>
        </EmptyStateContainer>
      </Container>
    );
  }

  // 데이터가 1개일 때
  if (validValues.length === 1) {
    const singleValue = validValues[0];
    const singleLabel = format(singleValue, 2);
    return (
      <Container
        style={{ width: safeWidth, height: containerHeight }}
        testID={`${testID}-single`}
        accessible
        accessibilityRole="image"
        accessibilityLabel={
          accessibilityLabel ??
          `${title}, 기록 1개, ${singleLabel}. 내일부터 추이가 표시됩니다.`
        }
      >
        {showChange && (
          <ChangeRow>
            <ChangeLabel>기간 수익률</ChangeLabel>
            <ChangeValue $color={theme.colors.textSecondary}>—</ChangeValue>
          </ChangeRow>
        )}
        <EmptyStateContainer style={{ height: safeHeight }}>
          <Svg width={safeWidth} height={safeHeight}>
            {[0.25, 0.5, 0.75].map((ratio, index) => (
              <Line
                key={index}
                x1={padding.left}
                y1={padding.top + chartHeight * ratio}
                x2={safeWidth - padding.right}
                y2={padding.top + chartHeight * ratio}
                stroke={gridColor}
                strokeWidth={1}
                strokeDasharray="4,4"
              />
            ))}
            <Circle
              cx={padding.left + chartWidth / 2}
              cy={padding.top + chartHeight / 2}
              r={6}
              fill={lineColor}
            />
            <SvgText
              x={padding.left + chartWidth / 2}
              y={padding.top + chartHeight / 2 + 28}
              fontSize={14}
              fontWeight="bold"
              fill={theme.colors.textPrimary}
              textAnchor="middle"
            >
              {singleLabel}
            </SvgText>
            <SvgText
              x={padding.left + chartWidth / 2}
              y={padding.top + chartHeight / 2 + 44}
              fontSize={10}
              fill={labelColor}
              textAnchor="middle"
            >
              {labels[0] ?? ''}
            </SvgText>
          </Svg>
        </EmptyStateContainer>
      </Container>
    );
  }

  // 최소/최대값 계산 (값 범위의 5% 여백)
  const rawMin = Math.min(...validValues);
  const rawMax = Math.max(...validValues);
  const spread = rawMax - rawMin;
  const margin = spread > 0 ? spread * 0.1 : Math.abs(rawMax) * 0.05 || 1;
  const minValue = Math.max(rawMin - margin, rawMin >= 0 ? 0 : -Infinity);
  const maxValue = rawMax + margin;
  const valueRange = Math.max(maxValue - minValue, Number.EPSILON);

  const getX = (index: number): number => {
    const divisor = Math.max(validValues.length - 1, 1);
    return safeNumber(
      padding.left + (index / divisor) * chartWidth,
      padding.left,
    );
  };

  const getY = (value: number): number => {
    const y =
      padding.top +
      chartHeight -
      ((safeNumber(value, minValue) - minValue) / valueRange) * chartHeight;
    return safeNumber(y, padding.top + chartHeight / 2);
  };

  const linePath = validValues
    .map(
      (value, index) =>
        `${index === 0 ? 'M' : 'L'} ${getX(index).toFixed(2)} ${getY(
          value,
        ).toFixed(2)}`,
    )
    .join(' ');

  const bottomY = padding.top + chartHeight;
  const areaPath = `${linePath} L ${getX(validValues.length - 1).toFixed(
    2,
  )} ${bottomY.toFixed(2)} L ${getX(0).toFixed(2)} ${bottomY.toFixed(2)} Z`;

  // Y축 라벨 (최저/중간/최고)
  const yValues = [minValue, (minValue + maxValue) / 2, maxValue];
  const yLabels = formatDistinctLabels(yValues, format);

  // 변화율 계산
  const firstValue = validValues[0];
  const lastValue = validValues[validValues.length - 1];
  const changePercent =
    firstValue > 0 ? ((lastValue - firstValue) / firstValue) * 100 : null;
  const changeColor =
    changePercent === null
      ? theme.colors.textSecondary
      : changePercent >= 0
      ? theme.colors.success
      : theme.colors.error;

  const lastPointX = getX(validValues.length - 1);
  const lastPointY = getY(lastValue);

  const [minLabel, maxLabel] = formatDistinctLabels([rawMin, rawMax], format);
  const summary =
    accessibilityLabel ??
    `${title}, ${labels[0] ?? ''}부터 ${
      labels[labels.length - 1] ?? ''
    }까지, 최저 ${minLabel}, 최고 ${maxLabel}, 현재 ${format(lastValue, 2)}${
      changePercent !== null
        ? `, 기간 수익률 ${
            changePercent >= 0 ? '+' : ''
          }${changePercent.toFixed(2)}%`
        : ''
    }`;

  // X축 라벨 인덱스 (처음/가운데/끝, 중복 제거)
  const xLabelIndexes = [
    ...new Set([0, Math.floor((labels.length - 1) / 2), labels.length - 1]),
  ].filter(i => i >= 0 && i < validValues.length);

  return (
    <Container
      style={{ width: safeWidth, height: containerHeight }}
      testID={testID}
      accessible
      accessibilityRole="image"
      accessibilityLabel={summary}
    >
      {showChange && (
        <ChangeRow>
          <ChangeLabel>기간 수익률</ChangeLabel>
          <ChangeValue $color={changeColor}>
            {changePercent === null
              ? '—'
              : `${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%`}
          </ChangeValue>
        </ChangeRow>
      )}

      <Svg width={safeWidth} height={safeHeight}>
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={fillColor} stopOpacity="0.3" />
            <Stop offset="100%" stopColor={fillColor} stopOpacity="0.05" />
          </LinearGradient>
        </Defs>

        {/* 배경 그리드 + Y축 라벨 */}
        {yValues.map((value, index) => {
          const y = getY(value);
          return (
            <React.Fragment key={index}>
              <Line
                x1={padding.left}
                y1={y}
                x2={safeWidth - padding.right}
                y2={y}
                stroke={gridColor}
                strokeWidth={1}
                strokeDasharray="4,4"
              />
              <SvgText
                x={padding.left - 6}
                y={y + 4}
                fontSize={10}
                fill={labelColor}
                textAnchor="end"
              >
                {yLabels[index]}
              </SvgText>
            </React.Fragment>
          );
        })}

        <Path d={areaPath} fill={`url(#${gradientId})`} />

        <Path
          d={linePath}
          stroke={lineColor}
          strokeWidth={2.5}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {showLabels &&
          labels.length > 0 &&
          xLabelIndexes.map(labelIndex =>
            labels[labelIndex] ? (
              <SvgText
                key={labelIndex}
                x={getX(labelIndex)}
                y={safeHeight - 5}
                fontSize={10}
                fill={labelColor}
                textAnchor={
                  labelIndex === 0
                    ? 'start'
                    : labelIndex === validValues.length - 1
                    ? 'end'
                    : 'middle'
                }
              >
                {labels[labelIndex]}
              </SvgText>
            ) : null,
          )}

        <Circle cx={lastPointX} cy={lastPointY} r={4} fill={lineColor} />
      </Svg>
    </Container>
  );
}

const Container = styled.View`
  align-items: center;
`;

const EmptyStateContainer = styled.View`
  justify-content: center;
  align-items: center;
  position: relative;
`;

const EmptyOverlay = styled.View`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  justify-content: center;
  align-items: center;
  padding: 0 20px;
`;

const EmptyTitle = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 6px;
  text-align: center;
`;

const EmptyDescription = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 13px;
  line-height: 19px;
  text-align: center;
`;

const ChangeRow = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  padding: 0 ${({ theme }) => theme.spacing.md}px;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
`;

const ChangeLabel = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 12px;
`;

const ChangeValue = styled.Text<{ $color: string }>`
  color: ${({ $color }) => $color};
  font-size: 14px;
  font-weight: 600;
`;

export default LineChart;
