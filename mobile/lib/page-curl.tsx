/**
 * Page curl effect using Skia shaders.
 * Adapted from William Candillon's Riveo page curl.
 *
 * Takes two SkImage objects (front page + back page) and renders
 * a GPU-accelerated curl animation driven by a shared value.
 */

import { useWindowDimensions } from "react-native";
import {
  Canvas,
  Skia,
  Shader,
  Fill,
  Image,
} from "@shopify/react-native-skia";
import { useDerivedValue } from "react-native-reanimated";
import type { SkImage, SkRuntimeEffect } from "@shopify/react-native-skia";
import type { SharedValue } from "react-native-reanimated";

let cachedEffect: SkRuntimeEffect | null = null;

function getShaderEffect() {
  if (cachedEffect) return cachedEffect;
  cachedEffect = Skia.RuntimeEffect.Make(`
    uniform shader frontPage;
    uniform shader backPage;
    uniform float2 resolution;
    uniform float pointer;
    uniform float origin;

    const float PI = 3.14159265;
    const float radius = 80.0;

    half4 main(float2 xy) {
      float dx = origin - pointer;
      float x = resolution.x - dx;
      float d = xy.x - x;

      // Region 1: Beyond curl — show front page, gradually fading
      if (d > radius) {
        half4 c = frontPage.eval(xy);
        float fade = clamp(1.0 - (d - radius) / (radius * 2.0), 0.3, 1.0);
        c.rgb *= fade;
        return c;
      }

      // Region 2: Inside curl — paper bending
      if (d > 0.0) {
        float theta = asin(d / radius);
        float d1 = theta * radius;

        // Front face of curling page
        float2 uv = float2(x + d1, xy.y);
        if (uv.x >= 0.0 && uv.x <= resolution.x) {
          half4 c = frontPage.eval(uv);
          // Add shadow at curl edge
          float shadow = pow(clamp((radius - d) / radius, 0.0, 1.0), 0.3);
          c.rgb *= shadow;
          return c;
        }

        // Back face — show darker version of front
        float d2 = (PI - theta) * radius;
        float2 buv = float2(x + d2, xy.y);
        if (buv.x >= 0.0 && buv.x <= resolution.x) {
          half4 c = frontPage.eval(buv);
          c.rgb *= 0.5;
          return c;
        }
      }

      // Region 3: Behind curl — show next page
      return backPage.eval(xy);
    }
  `);
  return cachedEffect;
}

interface PageCurlProps {
  frontImage: SkImage;
  backImage: SkImage;
  /** Pointer X position (shared value, driven by gesture) */
  pointer: SharedValue<number>;
  /** Origin X position (shared value, typically screen width) */
  origin: SharedValue<number>;
  width: number;
  height: number;
}

export function PageCurl({
  frontImage,
  backImage,
  pointer,
  origin,
  width,
  height,
}: PageCurlProps) {
  const effect = getShaderEffect();
  if (!effect) return null;

  const uniforms = useDerivedValue(() => ({
    resolution: [width, height],
    pointer: pointer.value,
    origin: origin.value,
  }));

  return (
    <Canvas style={{ width, height }}>
      <Fill>
        <Shader source={effect} uniforms={uniforms}>
          <Shader
            source={Skia.RuntimeEffect.Make(`
              uniform shader image;
              half4 main(float2 xy) { return image.eval(xy); }
            `)!}
          >
            <Image
              image={frontImage}
              x={0}
              y={0}
              width={width}
              height={height}
              fit="cover"
            />
          </Shader>
          <Shader
            source={Skia.RuntimeEffect.Make(`
              uniform shader image;
              half4 main(float2 xy) { return image.eval(xy); }
            `)!}
          >
            <Image
              image={backImage}
              x={0}
              y={0}
              width={width}
              height={height}
              fit="cover"
            />
          </Shader>
        </Shader>
      </Fill>
    </Canvas>
  );
}
