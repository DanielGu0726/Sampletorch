"""mesh_17.stl -> models/crown17.bin

- 마진(경계) 루프를 찾아 루프 자체와 주변 면을 Taubin 스무딩
- 교합면이 +Y, 마진 최상단이 Y=0, 마진 중심이 원점이 되도록 정렬
- 어버트먼트를 만들 수 있도록 마진을 각도 기준 128점으로 재샘플링해 함께 저장

형식: [정점 수 u32][인덱스 수 u32][마진 점 수 u32]
      [위치 f32x3...][인덱스 u16...][마진 f32x3...]
사용: python tools/convert_crown.py mesh_17.stl models/crown17.bin
"""
import struct
import sys
from collections import Counter, defaultdict

import numpy as np

SCALE = 0.15          # mm -> 화면 단위
RINGS = 8             # 마진에서 몇 링까지 스무딩할지
MARGIN_SAMPLES = 128


def load_stl(path):
    d = open(path, 'rb').read()
    n = struct.unpack('<I', d[80:84])[0]
    a = np.frombuffer(d[84:84 + 50 * n], dtype=np.dtype([('n', '<f4', 3), ('v', '<f4', (3, 3)), ('a', '<u2')]))
    v = a['v'].reshape(-1, 3).astype(np.float64)
    u, inv = np.unique(np.round(v, 5), axis=0, return_inverse=True)
    return u, inv.reshape(-1, 3)


def boundary_loop(faces):
    edges = Counter()
    for t in faces:
        for i in range(3):
            edges[tuple(sorted((t[i], t[(i + 1) % 3])))] += 1
    nb = defaultdict(list)
    for (a, b), c in edges.items():
        if c == 1:
            nb[a].append(b)
            nb[b].append(a)
    start = next(iter(nb))
    loop, prev, cur = [start], None, start
    while True:
        nxt = [x for x in nb[cur] if x != prev][0]
        if nxt == start:
            break
        loop.append(nxt)
        prev, cur = cur, nxt
    assert len(loop) == len(nb), f'경계 루프가 하나가 아님: {len(loop)} / {len(nb)}'
    return np.array(loop)


def taubin(P, neighbors, movable, weight, iters, lam=.5, mu=-.53):
    for _ in range(iters):
        for f in (lam, mu):
            avg = np.array([P[n].mean(0) if len(n) else P[i] for i, n in enumerate(neighbors)])
            step = (avg - P) * (f * weight)[:, None]
            P = P + step * movable[:, None]
    return P


def main(src, dst):
    V, F = load_stl(src)
    loop = boundary_loop(F)

    # 1) 마진 루프 자체를 루프 방향으로 스무딩
    L = V[loop]
    nbr = [[(i - 1) % len(L), (i + 1) % len(L)] for i in range(len(L))]
    L = taubin(L, nbr, np.ones(len(L)), np.ones(len(L)), 30)
    V[loop] = L

    # 2) 마진에서 RINGS 링 이내 면을 스무딩 (마진에 가까울수록 강하게, 마진 점은 고정)
    adj = [set() for _ in range(len(V))]
    for a, b, c in F:
        adj[a] |= {b, c}; adj[b] |= {a, c}; adj[c] |= {a, b}
    ring = np.full(len(V), 99)
    ring[loop] = 0
    frontier = set(loop.tolist())
    for r in range(1, RINGS + 1):
        nxt = {n for i in frontier for n in adj[i] if ring[n] == 99}
        for n in nxt:
            ring[n] = r
        frontier = nxt
    movable = ((ring > 0) & (ring <= RINGS)).astype(float)
    weight = np.clip(1 - (ring - 1) / RINGS, 0, 1)
    V = taubin(V, [list(s) for s in adj], movable, weight, 12)

    # 3) 정렬: x축 180도 회전 (교합면 +Y), 마진 중심 원점, 마진 최상단 Y=0
    cx, cy, zt = V[loop, 0].mean(), V[loop, 1].mean(), V[loop, 2].max()
    P = np.stack([(V[:, 0] - cx), (zt - V[:, 2]), -(V[:, 1] - cy)], 1) * SCALE

    # 4) 마진을 각도 기준으로 재샘플링
    M = P[loop]
    ang = np.arctan2(M[:, 2], M[:, 0])
    order = np.argsort(ang)
    ang, M = ang[order], M[order]
    ang = np.concatenate([ang - 2 * np.pi, ang, ang + 2 * np.pi])
    M = np.concatenate([M, M, M])
    th = np.linspace(-np.pi, np.pi, MARGIN_SAMPLES, endpoint=False)
    r = np.interp(th, ang, np.hypot(M[:, 0], M[:, 2]))
    y = np.interp(th, ang, M[:, 1])
    margin = np.stack([np.cos(th) * r, y, np.sin(th) * r], 1)

    with open(dst, 'wb') as f:
        f.write(struct.pack('<III', len(P), F.size, len(margin)))
        f.write(P.astype('<f4').tobytes())
        f.write(F.astype('<u2').tobytes())
        f.write(margin.astype('<f4').tobytes())
    print(f'정점 {len(P)}, 삼각형 {len(F)}, 마진 루프 {len(loop)}점 -> {len(margin)}점')
    print(f'마진 반지름 {r.min():.3f}~{r.max():.3f}, 높이 {y.min():.3f}~{y.max():.3f}')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
