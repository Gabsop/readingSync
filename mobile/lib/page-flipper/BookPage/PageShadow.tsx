import React from 'react';
import Animated, {
  interpolate,
  Extrapolate,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { Gradient } from '../Components/Gradient';
import type { Size } from '../types';

type PageShadowProps = {
  degrees: Animated.SharedValue<number>;
  viewHeight: number;
  right: boolean;
  containerSize: Size;
  width?: number;
};

const PageShadow: React.FC<PageShadowProps> = ({
  degrees,
  viewHeight,
  right,
  containerSize,
}) => {
  const colors = right
    ? [
        'rgba(0,0,0,0.0)',
        'rgba(0,0,0,0.0)',
        'rgba(0,0,0,0.05)',
        'rgba(0,0,0,0.15)',
        'rgba(0,0,0,0.3)',
        'rgba(0,0,0,0.5)',
      ]
    : [
        'rgba(0,0,0,0.5)',
        'rgba(0,0,0,0.3)',
        'rgba(0,0,0,0.15)',
        'rgba(0,0,0,0.05)',
        'rgba(0,0,0,0.0)',
        'rgba(0,0,0,0)',
      ];

  const shadowWidth = containerSize.width * 0.1;

  const animatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      Math.abs(degrees.value),
      [0, 15, 60, 120, 180],
      [0, 0.3, 1, 0.8, 0],
      Extrapolate.CLAMP
    );
    const w = interpolate(
      Math.abs(degrees.value),
      [0, 30, 90, 180],
      [shadowWidth * 0.3, shadowWidth, shadowWidth, shadowWidth * 0.5],
      Extrapolate.CLAMP
    );
    return {
      opacity,
      width: w,
      ...(right ? { left: -w } : { right: -w }),
    };
  });

  return (
    <Animated.View
      style={[
        {
          zIndex: 2,
          height: viewHeight,
          position: 'absolute',
        },
        animatedStyle,
      ]}
    >
      <Gradient
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        colors={colors}
        style={{
          flex: 1,
        }}
      />
    </Animated.View>
  );
};
export default PageShadow;
