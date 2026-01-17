/**
 * 포트폴리오 가치 추이 라인 차트
 */

import React from 'react';
import styled from 'styled-components/native';
import Svg, {
  Path,
  Line,
  Text as SvgText,
  Defs,
  LinearGradient,
  Stop,
  Rect,
  Circle,
} from 'react-native-svg';

interface Props {
  labels: string[];
  values: number[];
  width?: number;
  height?: number;
  showLabels?: boolean;
  color?: string;
  gradientColor?: string;
}

// 안전한 숫자 검증 함수
const safeNumber = (value: number, fallback: number = 0): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return value;
};

export function LineChart({
  labels,
  values,
  width = 320,
  height = 180,
  showLabels = true,
  color = '#6366F1',
  gradientColor = '#6366F1',
}: Props) {
  // 안전한 크기 값 보장
  const safeWidth = safeNumber(width, 320);
  const safeHeight = safeNumber(height, 180);

  const padding = {
    top: 20,
    right: 10,
    bottom: showLabels ? 30 : 10,
    left: 50,
  };
  const chartWidth = Math.max(safeWidth - padding.left - padding.right, 1);
  const chartHeight = Math.max(safeHeight - padding.top - padding.bottom, 1);

  // 빈 데이터 처리 - 개선된 Empty State
  if (!values || values.length === 0) {
    return (
      <Container style={{ width: safeWidth, height: safeHeight + 40 }}>
        <ChangeRow>
          <ChangeLabel>기간 수익률</ChangeLabel>
          <ChangeValue $positive={true}>--</ChangeValue>
        </ChangeRow>
        <EmptyStateContainer style={{ height: safeHeight }}>
          <Svg width={safeWidth} height={safeHeight}>
            <Defs>
              <LinearGradient id="emptyGradient" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%" stopColor="#3A3A4C" stopOpacity="0.3" />
                <Stop offset="100%" stopColor="#3A3A4C" stopOpacity="0.05" />
              </LinearGradient>
            </Defs>
            {/* 배경 그리드 라인 */}
            {[0.25, 0.5, 0.75].map((ratio, index) => (
              <Line
                key={index}
                x1={padding.left}
                y1={padding.top + chartHeight * ratio}
                x2={safeWidth - padding.right}
                y2={padding.top + chartHeight * ratio}
                stroke="#333"
                strokeWidth={1}
                strokeDasharray="4,4"
              />
            ))}
            {/* 플레이스홀더 웨이브 라인 */}
            <Path
              d={`M ${padding.left} ${padding.top + chartHeight * 0.6}
                  Q ${padding.left + chartWidth * 0.25} ${
                padding.top + chartHeight * 0.4
              },
                    ${padding.left + chartWidth * 0.5} ${
                padding.top + chartHeight * 0.5
              }
                  T ${padding.left + chartWidth} ${
                padding.top + chartHeight * 0.45
              }`}
              stroke="#3A3A4C"
              strokeWidth={2}
              strokeDasharray="8,8"
              fill="none"
            />
          </Svg>
          <EmptyOverlay>
            <EmptyIcon>📊</EmptyIcon>
            <EmptyTitle>아직 데이터가 없어요</EmptyTitle>
            <EmptyDescription>
              거래 기록이 쌓이면 포트폴리오 추이를{'\n'}확인할 수 있어요
            </EmptyDescription>
          </EmptyOverlay>
        </EmptyStateContainer>
      </Container>
    );
  }

  // 유효한 숫자값만 필터링
  const validValues = values.map(v => safeNumber(v, 0));

  // 데이터가 1개일 때 처리 - 개선된 UI
  if (validValues.length === 1) {
    const singleValue = safeNumber(validValues[0], 0);
    return (
      <Container style={{ width: safeWidth, height: safeHeight + 40 }}>
        <ChangeRow>
          <ChangeLabel>기간 수익률</ChangeLabel>
          <ChangeValue $positive={true}>0.00%</ChangeValue>
        </ChangeRow>
        <EmptyStateContainer style={{ height: safeHeight }}>
          <Svg width={safeWidth} height={safeHeight}>
            <Defs>
              <LinearGradient
                id="singlePointGradient"
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <Stop offset="0%" stopColor={gradientColor} stopOpacity="0.2" />
                <Stop
                  offset="100%"
                  stopColor={gradientColor}
                  stopOpacity="0.05"
                />
              </LinearGradient>
            </Defs>
            {/* 배경 그리드 */}
            {[0.25, 0.5, 0.75].map((ratio, index) => (
              <Line
                key={index}
                x1={padding.left}
                y1={padding.top + chartHeight * ratio}
                x2={safeWidth - padding.right}
                y2={padding.top + chartHeight * ratio}
                stroke="#333"
                strokeWidth={1}
                strokeDasharray="4,4"
              />
            ))}
            {/* 단일 포인트 - 중앙에 큰 원 */}
            <Circle
              cx={padding.left + chartWidth / 2}
              cy={padding.top + chartHeight / 2}
              r={20}
              fill="url(#singlePointGradient)"
            />
            <Circle
              cx={padding.left + chartWidth / 2}
              cy={padding.top + chartHeight / 2}
              r={6}
              fill={color}
            />
            {/* 가격 표시 */}
            <SvgText
              x={padding.left + chartWidth / 2}
              y={padding.top + chartHeight / 2 + 40}
              fontSize={14}
              fontWeight="bold"
              fill="#FFF"
              textAnchor="middle"
            >
              $
              {singleValue.toLocaleString('en-US', {
                maximumFractionDigits: 0,
              })}
            </SvgText>
            <SvgText
              x={padding.left + chartWidth / 2}
              y={padding.top + chartHeight / 2 + 56}
              fontSize={10}
              fill="#888"
              textAnchor="middle"
            >
              현재 자산
            </SvgText>
          </Svg>
        </EmptyStateContainer>
      </Container>
    );
  }

  // 최소/최대값 계산 (안전하게)
  const rawMin = Math.min(...validValues);
  const rawMax = Math.max(...validValues);
  const minValue = safeNumber(rawMin * 0.95, 0);
  const maxValue = safeNumber(rawMax * 1.05, 100);
  const valueRange = Math.max(maxValue - minValue, 0.01); // 0으로 나누기 방지

  // 좌표 계산 (안전하게)
  const getX = (index: number): number => {
    const divisor = Math.max(validValues.length - 1, 1);
    const x = padding.left + (index / divisor) * chartWidth;
    return safeNumber(x, padding.left);
  };

  const getY = (value: number): number => {
    const safeValue = safeNumber(value, minValue);
    const y =
      padding.top +
      chartHeight -
      ((safeValue - minValue) / valueRange) * chartHeight;
    return safeNumber(y, padding.top + chartHeight / 2);
  };

  // 라인 경로 생성 (유효한 좌표만)
  const linePath = validValues
    .map((value, index) => {
      const x = getX(index);
      const y = getY(value);
      // 유효하지 않은 좌표는 스킵
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return null;
      }
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .filter(Boolean)
    .join(' ');

  // 경로가 비어있으면 빈 차트 표시
  if (!linePath || linePath.trim() === '') {
    return (
      <Container style={{ width: safeWidth, height: safeHeight }}>
        <EmptyText>차트를 그릴 수 없습니다</EmptyText>
      </Container>
    );
  }

  // 그라데이션 영역 경로
  const lastX = getX(validValues.length - 1);
  const firstX = getX(0);
  const bottomY = padding.top + chartHeight;
  const areaPath = `
    ${linePath}
    L ${safeNumber(lastX, padding.left).toFixed(2)} ${bottomY.toFixed(2)}
    L ${safeNumber(firstX, padding.left).toFixed(2)} ${bottomY.toFixed(2)}
    Z
  `;

  // Y축 라벨 생성 (3개)
  const yLabels = [minValue, (minValue + maxValue) / 2, maxValue].map(v =>
    safeNumber(v, 0),
  );

  // 변화율 계산
  const firstValue = safeNumber(validValues[0], 0);
  const lastValue = safeNumber(validValues[validValues.length - 1], 0);
  const changePercent =
    firstValue > 0
      ? safeNumber(((lastValue - firstValue) / firstValue) * 100, 0)
      : 0;
  const isPositive = changePercent >= 0;

  // 마지막 포인트 좌표
  const lastPointX = safeNumber(getX(validValues.length - 1), padding.left);
  const lastPointY = safeNumber(getY(lastValue), padding.top + chartHeight / 2);

  return (
    <Container style={{ width: safeWidth, height: safeHeight + 40 }}>
      {/* 변화율 표시 */}
      <ChangeRow>
        <ChangeLabel>기간 수익률</ChangeLabel>
        <ChangeValue $positive={isPositive}>
          {isPositive ? '+' : ''}
          {changePercent.toFixed(2)}%
        </ChangeValue>
      </ChangeRow>

      <Svg width={safeWidth} height={safeHeight}>
        <Defs>
          <LinearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={gradientColor} stopOpacity="0.3" />
            <Stop offset="100%" stopColor={gradientColor} stopOpacity="0.05" />
          </LinearGradient>
        </Defs>

        {/* 배경 그리드 */}
        {yLabels.map((value, index) => {
          const y = getY(value);
          if (!Number.isFinite(y)) return null;
          return (
            <React.Fragment key={index}>
              <Line
                x1={padding.left}
                y1={y}
                x2={safeWidth - padding.right}
                y2={y}
                stroke="#333"
                strokeWidth={1}
                strokeDasharray="4,4"
              />
              <SvgText
                x={padding.left - 5}
                y={y + 4}
                fontSize={10}
                fill="#888"
                textAnchor="end"
              >
                ${safeNumber(value, 0).toFixed(0)}
              </SvgText>
            </React.Fragment>
          );
        })}

        {/* 그라데이션 영역 */}
        <Path d={areaPath} fill="url(#areaGradient)" />

        {/* 라인 */}
        <Path
          d={linePath}
          stroke={color}
          strokeWidth={2.5}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* X축 라벨 */}
        {showLabels && labels.length > 0 && (
          <>
            {[0, Math.floor(labels.length / 2), labels.length - 1]
              .filter(
                (i, _, arr) =>
                  arr.indexOf(i) === arr.lastIndexOf(i) ||
                  i === 0 ||
                  i === labels.length - 1,
              )
              .map(labelIndex => {
                if (!labels[labelIndex]) return null;
                const x = getX(labelIndex);
                if (!Number.isFinite(x)) return null;
                return (
                  <SvgText
                    key={labelIndex}
                    x={x}
                    y={safeHeight - 5}
                    fontSize={10}
                    fill="#888"
                    textAnchor="middle"
                  >
                    {labels[labelIndex]}
                  </SvgText>
                );
              })}
          </>
        )}

        {/* 마지막 포인트 강조 */}
        <Rect
          x={lastPointX - 4}
          y={lastPointY - 4}
          width={8}
          height={8}
          rx={4}
          fill={color}
        />
      </Svg>
    </Container>
  );
}

const Container = styled.View`
  align-items: center;
`;

const EmptyStateContainer = styled.View`
  flex: 1;
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

const EmptyIcon = styled.Text`
  font-size: 48px;
  margin-bottom: 12px;
`;

const EmptyTitle = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 8px;
`;

const EmptyDescription = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 14px;
  text-align: center;
`;

const EmptyText = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 14px;
  text-align: center;
  margin-top: 60px;
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

const ChangeValue = styled.Text<{ $positive: boolean }>`
  color: ${({ $positive }) => ($positive ? '#22C55E' : '#EF4444')};
  font-size: 14px;
  font-weight: 600;
`;

export default LineChart;
