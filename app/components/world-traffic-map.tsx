import {
  useCallback,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import WorldMap, {
  type CountryContext,
  type ISOCode,
} from "react-svg-worldmap";

const MIN_SCALE = 0.5;
const MAX_SCALE = 3;
const INITIAL_SCALE = 1.2;
const SCALE_STEP = 0.1;

interface WorldTrafficMapProps {
  countries: Array<{
    code: string;
    visitors: number;
  }>;
}

interface Point {
  x: number;
  y: number;
}

export default function WorldTrafficMap({
  countries,
}: WorldTrafficMapProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    start: Point;
    origin: Point;
    moved: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const [scale, setScale] = useState(INITIAL_SCALE);
  const [position, setPosition] = useState<Point>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const data = countries.map((country) => ({
    country: country.code.toLowerCase() as ISOCode,
    value: country.visitors,
  }));

  const constrainPosition = useCallback(
    (nextPosition: Point, nextScale = scale): Point => {
      const viewport = viewportRef.current;
      if (!viewport) {
        return { x: 0, y: 0 };
      }

      const map = viewport.querySelector("svg");
      const mapBounds = map?.getBoundingClientRect();
      const currentScale = scale || MIN_SCALE;
      const baseWidth = mapBounds
        ? mapBounds.width / currentScale
        : viewport.clientWidth;
      const baseHeight = mapBounds
        ? mapBounds.height / currentScale
        : viewport.clientHeight;
      const maxX = Math.max(
        0,
        (baseWidth * nextScale - viewport.clientWidth) / 2,
      );
      const maxY = Math.max(
        0,
        (baseHeight * nextScale - viewport.clientHeight) / 2,
      );

      return {
        x: Math.max(-maxX, Math.min(maxX, nextPosition.x)),
        y: Math.max(-maxY, Math.min(maxY, nextPosition.y)),
      };
    },
    [scale],
  );

  const changeScale = useCallback(
    (nextScale: number) => {
      const clampedScale =
        Math.round(
          Math.max(MIN_SCALE, Math.min(MAX_SCALE, nextScale)) * 100,
        ) / 100;

      setScale(clampedScale);
      setPosition((current) => constrainPosition(current, clampedScale));
    },
    [constrainPosition],
  );

  const resetView = useCallback(() => {
    setScale(INITIAL_SCALE);
    setPosition({ x: 0, y: 0 });
  }, []);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;

    dragRef.current = {
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      origin: position,
      moved: false,
    };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - drag.start.x;
    const deltaY = event.clientY - drag.start.y;
    if (Math.abs(deltaX) + Math.abs(deltaY) > 4) {
      if (!drag.moved) {
        event.currentTarget.setPointerCapture(event.pointerId);
        setIsDragging(true);
      }
      drag.moved = true;
    }

    if (drag.moved) {
      setPosition(
        constrainPosition({
          x: drag.origin.x + deltaX,
          y: drag.origin.y + deltaY,
        }),
      );
    }
  };

  const finishPointerInteraction = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (drag.moved) {
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    }

    dragRef.current = null;
    setIsDragging(false);
  };

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    changeScale(scale + (event.deltaY < 0 ? SCALE_STEP : -SCALE_STEP));
  };

  const styleCountry = ({
    countryValue,
    minValue,
    maxValue,
  }: CountryContext) => {
    const hasTraffic =
      typeof countryValue === "number" && countryValue > 0;
    const intensity = hasTraffic
      ? maxValue === minValue
        ? 1
        : (countryValue - minValue) / (maxValue - minValue)
      : 0;

    return {
      fill: hasTraffic ? "#1769e0" : "#dbeafe",
      fillOpacity: hasTraffic ? 0.25 + Math.sqrt(intensity) * 0.75 : 1,
      stroke: "#ffffff",
      strokeWidth: 0.8,
      strokeOpacity: 1,
      outline: "none",
      cursor: hasTraffic ? "pointer" : "default",
      transition: "fill-opacity 120ms ease",
    };
  };

  return (
    <div className="geo-map-interactive">
      <div
        ref={viewportRef}
        className={`geo-map-viewport${isDragging ? " is-dragging" : ""}`}
        aria-label="Interactive traffic map. Drag to move and use the controls to zoom."
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointerInteraction}
        onPointerCancel={finishPointerInteraction}
        onWheel={handleWheel}
        onDragStart={(event) => event.preventDefault()}
        onClickCapture={(event) => {
          if (suppressClickRef.current) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
      >
        <div
          className="geo-map-canvas"
          style={{
            transform: `translate3d(${position.x}px, ${position.y}px, 0) scale(${scale})`,
          }}
        >
          <WorldMap
            data={data}
            size="xxl"
            color="#1769e0"
            backgroundColor="transparent"
            borderColor="#ffffff"
            frame={false}
            regionClassName="geo-map-region"
            styleFunction={styleCountry}
            hrefFunction={({ countryCode, countryName, countryValue }) =>
              typeof countryValue === "number" && countryValue > 0
                ? {
                    href: `/app/logs?country=${countryCode.toUpperCase()}`,
                    "aria-label": `View visitor logs from ${countryName}`,
                  }
                : undefined
            }
            tooltipTextFunction={({ countryName, countryValue }) =>
              typeof countryValue === "number"
                ? `${countryName}: ${countryValue.toLocaleString()} visitors — click to view logs`
                : `${countryName}: no traffic`
            }
          />
        </div>
      </div>

      <div className="geo-map-controls" aria-label="Map zoom controls">
        <button
          type="button"
          className="geo-map-control"
          aria-label="Zoom in"
          title="Zoom in"
          disabled={scale >= MAX_SCALE}
          onClick={() => changeScale(scale + SCALE_STEP)}
        >
          +
        </button>
        <button
          type="button"
          className="geo-map-control"
          aria-label="Zoom out"
          title="Zoom out"
          disabled={scale <= MIN_SCALE}
          onClick={() => changeScale(scale - SCALE_STEP)}
        >
          −
        </button>
        <button
          type="button"
          className="geo-map-control geo-map-control-reset"
          aria-label="Reset map view"
          title="Reset map view"
          onClick={resetView}
        >
          ↺
        </button>
      </div>
      <span className="geo-map-zoom-level" aria-live="polite">
        {Math.round(scale * 100)}%
      </span>
    </div>
  );
}
