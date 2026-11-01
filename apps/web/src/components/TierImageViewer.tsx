import { useCallback, useEffect, useRef, useState } from "react";
import {
  clampView,
  fitImage,
  zoomImage,
  type ImageBounds,
  type ImageView,
} from "../data/performance";
import Icon from "./Icon";

export default function TierImageViewer({
  src,
  title,
}: {
  src: string;
  title: string;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const bounds = useRef<ImageBounds>({
    width: 1,
    height: 1,
    imageWidth: 1,
    imageHeight: 1,
  });
  const current = useRef<ImageView>({ scale: 1, x: 0, y: 0 });
  const [view, setView] = useState(current.current);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const update = useCallback((next: ImageView) => {
    current.current = next;
    setView(next);
  }, []);
  const reset = useCallback(() => update(fitImage(bounds.current)), [update]);
  const zoom = useCallback(
    (factor: number, anchor?: { x: number; y: number }) => {
      if (!loaded) return;
      const b = bounds.current;
      update(
        zoomImage(
          current.current,
          current.current.scale * factor,
          anchor ?? { x: b.width / 2, y: b.height / 2 },
          b,
        ),
      );
    },
    [loaded, update],
  );

  useEffect(() => {
    const node = viewport.current;
    if (!node || !loaded) return;
    const observer = new ResizeObserver(() => {
      bounds.current = {
        ...bounds.current,
        width: node.clientWidth,
        height: node.clientHeight,
      };
      reset();
    });
    observer.observe(node);
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = node.getBoundingClientRect();
      const delta =
        event.deltaY *
        (event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? node.clientHeight
            : 1);
      zoom(Math.exp(-Math.max(-100, Math.min(100, delta)) * 0.003), {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
    };
    node.addEventListener("wheel", wheel, { passive: false });
    return () => {
      observer.disconnect();
      node.removeEventListener("wheel", wheel);
    };
  }, [loaded, reset, zoom]);

  const relativeZoom = loaded
    ? view.scale /
      Math.min(
        bounds.current.width / bounds.current.imageWidth,
        bounds.current.height / bounds.current.imageHeight,
      )
    : 1;
  return (
    <section className="card image-viewer">
      <div className="viewer-toolbar">
        <div>
          <strong>{title}</strong>
          <span className="muted small">滚轮缩放 · 拖动平移 · 双指缩放</span>
        </div>
        <div className="viewer-controls">
          <button
            className="btn btn-icon"
            aria-label="缩小天梯图"
            disabled={!loaded}
            onClick={() => zoom(1 / 1.25)}
          >
            <Icon name="minus" size={17} />
          </button>
          <output aria-label="天梯图缩放比例">
            {Math.round(relativeZoom * 100)}%
          </output>
          <button
            className="btn btn-icon"
            aria-label="放大天梯图"
            disabled={!loaded}
            onClick={() => zoom(1.25)}
          >
            <Icon name="plus" size={17} />
          </button>
          <button className="btn btn-ghost" disabled={!loaded} onClick={reset}>
            适应全图
          </button>
          <button
            className="btn btn-ghost"
            disabled={!loaded}
            onClick={() => {
              const b = bounds.current;
              update(
                clampView({ scale: b.width / b.imageWidth, x: 0, y: 0 }, b),
              );
            }}
          >
            适应宽度
          </button>
        </div>
      </div>
      <div
        ref={viewport}
        className={`tier-viewport ${dragging ? "is-dragging" : ""}`}
        tabIndex={0}
        role="region"
        aria-label={`${title}，可使用加减键缩放、方向键平移、Home 键重置`}
        onKeyDown={(event) => {
          if (!loaded) return;
          if (
            [
              "+",
              "=",
              "-",
              "Home",
              "ArrowLeft",
              "ArrowRight",
              "ArrowUp",
              "ArrowDown",
            ].includes(event.key)
          )
            event.preventDefault();
          if (event.key === "+" || event.key === "=") zoom(1.25);
          if (event.key === "-") zoom(1 / 1.25);
          if (event.key === "Home") reset();
          const move = {
            ArrowLeft: [60, 0],
            ArrowRight: [-60, 0],
            ArrowUp: [0, 60],
            ArrowDown: [0, -60],
          }[event.key];
          if (move)
            update(
              clampView(
                {
                  ...current.current,
                  x: current.current.x + move[0],
                  y: current.current.y + move[1],
                },
                bounds.current,
              ),
            );
        }}
        onDoubleClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          zoom(relativeZoom > 2 ? 1 / relativeZoom : 2, {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
          });
        }}
        onPointerDown={(event) => {
          if (!loaded || (event.pointerType === "mouse" && event.button !== 0))
            return;
          event.currentTarget.setPointerCapture(event.pointerId);
          pointers.current.set(event.pointerId, {
            x: event.clientX,
            y: event.clientY,
          });
          setDragging(true);
        }}
        onPointerMove={(event) => {
          const previous = pointers.current.get(event.pointerId);
          if (!previous) return;
          const before = [...pointers.current.values()];
          pointers.current.set(event.pointerId, {
            x: event.clientX,
            y: event.clientY,
          });
          const after = [...pointers.current.values()];
          if (after.length === 2) {
            const distance = (p: typeof after) =>
              Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
            const oldDistance = distance(before);
            if (oldDistance < 1) return;
            const rect = event.currentTarget.getBoundingClientRect();
            const center = {
              x: (before[0].x + before[1].x) / 2 - rect.left,
              y: (before[0].y + before[1].y) / 2 - rect.top,
            };
            const next = zoomImage(
              current.current,
              (current.current.scale * distance(after)) / oldDistance,
              center,
              bounds.current,
            );
            update(
              clampView(
                {
                  ...next,
                  x:
                    next.x +
                    (after[0].x + after[1].x - before[0].x - before[1].x) / 2,
                  y:
                    next.y +
                    (after[0].y + after[1].y - before[0].y - before[1].y) / 2,
                },
                bounds.current,
              ),
            );
          } else if (after.length === 1)
            update(
              clampView(
                {
                  ...current.current,
                  x: current.current.x + event.clientX - previous.x,
                  y: current.current.y + event.clientY - previous.y,
                },
                bounds.current,
              ),
            );
        }}
        onPointerUp={(event) => {
          pointers.current.delete(event.pointerId);
          setDragging(pointers.current.size > 0);
        }}
        onPointerCancel={(event) => {
          pointers.current.delete(event.pointerId);
          setDragging(pointers.current.size > 0);
        }}
        onLostPointerCapture={(event) => {
          pointers.current.delete(event.pointerId);
          setDragging(pointers.current.size > 0);
        }}
      >
        {!loaded && (
          <div className="viewer-placeholder" role="status">
            {failed
              ? "天梯图加载失败，请重试或查看下方数据排名。"
              : "正在加载天梯图…"}
            {failed && (
              <button
                className="btn"
                onClick={() => {
                  setFailed(false);
                  const img = viewport.current?.querySelector("img");
                  if (img) {
                    if (src.startsWith("data:")) img.src = src;
                    else {
                      const retryUrl = new URL(src, window.location.href);
                      retryUrl.searchParams.set("retry", String(Date.now()));
                      img.src = retryUrl.href;
                    }
                  }
                }}
              >
                重试
              </button>
            )}
          </div>
        )}
        <img
          src={src}
          alt={title}
          draggable={false}
          onError={() => {
            setFailed(true);
            setLoaded(false);
          }}
          onLoad={(event) => {
            const img = event.currentTarget,
              node = viewport.current!;
            bounds.current = {
              width: node.clientWidth,
              height: node.clientHeight,
              imageWidth: img.naturalWidth,
              imageHeight: img.naturalHeight,
            };
            setLoaded(true);
            setFailed(false);
            reset();
          }}
          style={{
            width: bounds.current.imageWidth,
            height: bounds.current.imageHeight,
            visibility: loaded ? "visible" : "hidden",
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
          }}
        />
      </div>
      <div className="viewer-caption">
        <Icon name="info" size={15} />
        <span>
          全图查看整体排名；适应宽度后可拖动查看细节。键盘支持 + / −、方向键和
          Home。
        </span>
      </div>
    </section>
  );
}
