/**
 * 单车 + 地铁通勤测算模型：
 * 将百度地图公交/地铁方案中的首末两端步行（>=350m）替换为共享单车接驳（约 12 km/h = 3.33 m/s + 3 分钟取还车冗余），
 * 当直线距离极近（<= 4.2 km）时同时计算全程骑行预计时间（约 13 km/h 修正路网曲折系数 1.28）。
 */
export function calculateBikePlusMetroMetrics({
  distanceM = 0,
  totalSec = 0,
  walkDistanceM = 0,
  walkSec = 0,
  priceFen = 0,
  straightLineM = 0,
  lines = [],
}) {
  const safeTotal = Math.max(0, Number(totalSec) || 0);
  const safeWalkM = Math.max(0, Number(walkDistanceM) || 0);
  const safeWalkSec = Math.max(0, Number(walkSec) || 0);
  const safeDistM = Math.max(0, Number(distanceM) || 0);
  const safeStraightM = Math.max(0, Number(straightLineM) || 0);

  // 跨城/异地超远岗位直接标注直线距离，避免跨城公交报错显示为空
  if (safeStraightM > 65000 && safeTotal === 0) {
    const straightKm = Math.round(safeStraightM / 1000);
    return {
      status: "DONE",
      effective_min: 999,
      bike_metro_min: null,
      walk_metro_min: null,
      direct_bike_min: null,
      prefer_direct_bike: false,
      distance_km: straightKm,
      bike_access_km: 0,
      price_yuan: 0,
      metro_lines: [],
      saved_min: 0,
      tier: "EXTREME",
      tier_label: "异地/超远",
      summary: `距家直线约 ${straightKm} km · 非同城日常通勤`,
    };
  }

  // 百度总耗时扣除纯步行耗时后即为乘车+换乘候车净耗时
  const transitOnlySec = Math.max(0, safeTotal - safeWalkSec);
  // 首末两端 < 350m 步行更快；>= 350m 改骑单车（12km/h = 3.333m/s + 180s 开锁停放）
  const bikeAccessSec = safeWalkM < 350 ? safeWalkSec : Math.round(safeWalkM / 3.333) + 180;
  const bikeMetroMin = safeTotal > 0 ? Math.max(5, Math.round((transitOnlySec + bikeAccessSec) / 60)) : null;
  const walkMetroMin = safeTotal > 0 ? Math.max(5, Math.round(safeTotal / 60)) : null;

  // 短距离评估全程骑单车
  const estRoadBikeM = safeStraightM > 0 ? Math.round(safeStraightM * 1.28) : safeDistM;
  const directBikeMin = estRoadBikeM > 0 && estRoadBikeM <= 9000 ? Math.max(4, Math.round(estRoadBikeM / 216) + 2) : null;

  const preferDirectBike = directBikeMin !== null && (bikeMetroMin === null || directBikeMin <= 24 || directBikeMin < bikeMetroMin);
  const effectiveMin = preferDirectBike ? directBikeMin : (bikeMetroMin ?? directBikeMin ?? null);

  let tier = "UNKNOWN";
  let tier_label = "待测算";
  if (effectiveMin !== null) {
    if (effectiveMin <= 35) {
      tier = "NEAR";
      tier_label = "极近优选";
    } else if (effectiveMin <= 55) {
      tier = "MODERATE";
      tier_label = "通勤适中";
    } else if (effectiveMin <= 75) {
      tier = "FAR";
      tier_label = "偏远较累";
    } else {
      tier = "EXTREME";
      tier_label = "极远劝退";
    }
  }

  const lineNames = [...new Set((lines || []).map((l) => String(l).replace(/\(.*\)$/, "").trim()).filter(Boolean))];
  const distanceKm = Number(((safeDistM || estRoadBikeM) / 1000).toFixed(1));
  const bikeAccessKm = Number((safeWalkM / 1000).toFixed(1));
  const priceYuan = Math.round((Number(priceFen) || 0) / 100);
  const savedMin = walkMetroMin && bikeMetroMin ? Math.max(0, walkMetroMin - bikeMetroMin) : 0;

  let summary = "暂无路线数据";
  if (preferDirectBike && directBikeMin !== null) {
    summary = `全程骑单车约 ${directBikeMin} 分钟（约 ${Number((estRoadBikeM / 1000).toFixed(1))} km）`;
    if (bikeMetroMin !== null && lineNames.length > 0) {
      summary += `；单车+地铁约 ${bikeMetroMin} 分钟（${lineNames.join("→")}）`;
    }
  } else if (bikeMetroMin !== null) {
    const linePart = lineNames.length ? lineNames.join("→") : "地铁/公交";
    const pricePart = priceYuan > 0 ? ` · ¥${priceYuan}` : "";
    const savePart = savedMin >= 3 ? `（比纯步行省 ${savedMin} 分钟）` : "";
    summary = `单车+地铁约 ${bikeMetroMin} 分钟 · ${distanceKm} km（单车接驳 ${bikeAccessKm} km + ${linePart}${pricePart}）${savePart}`;
  }

  return {
    status: effectiveMin !== null ? "DONE" : "NO_ROUTE",
    effective_min: effectiveMin,
    bike_metro_min: bikeMetroMin,
    walk_metro_min: walkMetroMin,
    direct_bike_min: directBikeMin,
    prefer_direct_bike: preferDirectBike,
    distance_km: distanceKm,
    bike_access_km: bikeAccessKm,
    price_yuan: priceYuan,
    metro_lines: lineNames,
    saved_min: savedMin,
    tier,
    tier_label,
    summary,
  };
}
