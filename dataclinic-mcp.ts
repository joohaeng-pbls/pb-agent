/**
 * DataClinic MCP Server for NanoClaw
 * Exposes dataclinic.ai data quality diagnostic platform as tools.
 * API base: https://api.dataclinic.ai
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const API_BASE = process.env.DATACLINIC_API_URL || 'https://api.dataclinic.ai';
const CDN_BASE = 'https://cdn.dataclinic.ai/';
const FIREBASE_TOKEN = process.env.DATACLINIC_TOKEN || '';

function log(msg: string): void {
  console.error(`[DATACLINIC] ${msg}`);
}

async function apiFetch(endpoint: string, options?: RequestInit): Promise<unknown> {
  const url = `${API_BASE}${endpoint}`;
  const headers: Record<string, string> = {
    'x-header-language': 'ko',
    'Accept': 'application/json',
    ...(options?.headers as Record<string, string> || {}),
  };
  if (FIREBASE_TOKEN) headers['Authorization'] = `Bearer ${FIREBASE_TOKEN}`;
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.json();
}

function qs(params: Record<string, string | number | boolean | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

/** URL-encode each path segment of a CDN URL */
function encodeCdnUrl(raw: string): string {
  return raw.replace(/(https?:\/\/[^/]+)(.*)/, (_, origin, pathname) =>
    origin + pathname.split('/').map((seg: string) =>
      encodeURIComponent(decodeURIComponent(seg))
    ).join('/')
  );
}

type ChartImage = { label: string; url: string };
type ChartRef = { label: string; chartId: number; note: string };

/**
 * Extract CDN chart images from level content response with human-readable labels.
 * Also returns JS-rendered chart references so the agent knows what needs Playwright.
 */
function extractLevelChartInfo(
  data: Record<string, unknown>,
  level: string,
): { cdnImages: ChartImage[]; jsCharts: ChartRef[] } {
  const cdnImages: ChartImage[] = [];
  const jsCharts: ChartRef[] = [];
  const seen = new Set<string>();

  const addCdn = (path: string, label: string) => {
    if (!path || !path.startsWith('diagnosis_results/')) return;
    const url = encodeCdnUrl(CDN_BASE + path);
    if (seen.has(url)) return;
    seen.add(url);
    cdnImages.push({ label, url });
  };

  const addJs = (chartId: unknown, label: string, note: string) => {
    if (!chartId) return;
    jsCharts.push({ label, chartId: Number(chartId), note });
  };

  if (level === '1') {
    addCdn(data.overallMeanImagePath as string, '전체 평균 이미지 (Overall Mean Image)');
    addJs(data.overallAverageImageHistogramChartId, '픽셀 히스토그램 (Pixel Histogram)', 'JS 렌더링 — chartId=3, Playwright 필요');

    const classPaths = (data.classwiseMeanImagePaths as Array<Record<string, unknown>> ?? []);
    for (const c of classPaths) {
      addCdn(c.meanImagePath as string, `클래스 평균 이미지: ${c.className}`);
    }
  }

  if (level === '2' || level === '3') {
    const isL2 = level === '2';

    // PCA / Overall distribution
    addCdn(data.overallChartImagePath as string,
      isL2 ? 'PCA 전체 분포 (Overall Data Distribution, chartId=4)' : 'PCA 전체 분포 (Overall Data Distribution, chartId=16)');

    // Manifold shape — JS
    addJs(data.manifoldGeometryMeasurementChartId,
      'Manifold 형상 측정 (Macroscopic)',
      `JS 렌더링 — chartId=${isL2 ? 5 : 17}, Playwright 필요`);

    // 전체 밀도 플롯 (밀도 지형도) — CDN static
    // chartId=6(L2)/18(L3): "밀도 측정 (1) > 밀도 차트" — 전체 데이터의 밀도 분포를 2D로 시각화한 플롯
    addCdn(data.overallDensityChartImage as string,
      isL2 ? '전체 밀도 플롯 (밀도 지형도, chartId=6)' : '전체 밀도 플롯 (밀도 지형도, chartId=18)');

    // 거리-밀도 분포 — JS
    // chartId=8(L2)/19(L3): "거리-밀도 측정 > 공간에 따른 밀도 분포"
    addJs(data.overallDensityDistributionChartId,
      '거리-밀도 분포 (공간에 따른 밀도 분포)',
      `JS 렌더링 — chartId=${isL2 ? 8 : 19}, Playwright 필요`);

    // 밀도 등고선 (등밀도선) — JS
    // chartId=9(L2)/20(L3): "밀도측정 (2) > 데이터 등밀도선" — 등고선 형태의 JS 인터랙티브 차트
    addJs(data.overallIsoDensityChartId,
      '밀도 등고선 (데이터 등밀도선)',
      `JS 렌더링 — chartId=${isL2 ? 9 : 20}, Playwright 필요`);

    // 밀도 히스토그램 — JS
    // chartId=13(L2)/23(L3): "밀도 측정 (3) 분포적 속성 > 밀도 히스토그램"
    addJs(data.overallNormDensityChartId,
      '밀도 히스토그램',
      `JS 렌더링 — chartId=${isL2 ? 13 : 23}, Playwright 필요`);

    // 밀도 박스 차트 — JS
    // chartId=15(L2)/24(L3): "밀도 측정 (3) 분포적 속성 > 밀도 박스 차트"
    addJs(data.overallBoxWhiskerChartId,
      '밀도 박스 차트',
      `JS 렌더링 — chartId=${isL2 ? 15 : 24}, Playwright 필요`);

    // 클래스별 밀도 플롯 — CDN
    const classwiseDensity = (data.classwiseDensityChartImages as Array<Record<string, unknown>> ?? []);
    for (const c of classwiseDensity) {
      addCdn(c.chartImagePath as string, `클래스별 밀도 플롯: ${c.className}`);
      addCdn(c.representativeImagePath as string, `대표 이미지: ${c.className}`);
    }
  }

  return { cdnImages, jsCharts };
}

/** Format a grade/score value */
function grade(v: unknown): string {
  if (v === null || v === undefined) return '-';
  return String(v);
}

// ── 리포트 검색 ──────────────────────────────────────────────────────────────
const server = new McpServer({ name: 'dataclinic', version: '1.2.0' });

server.tool(
  'dataclinic_search_reports',
  'Search DataClinic diagnosis reports by keyword or tags. Returns a list with IDs, names, and metadata.',
  {
    keyword: z.string().optional().describe('Search keyword (dataset name, topic)'),
    tagIds: z.string().optional().describe('Comma-separated tag IDs (use dataclinic_get_filters to get IDs)'),
    limit: z.number().optional().describe('Number of results (default 10)'),
    offset: z.number().optional().describe('Pagination offset (default 0)'),
  },
  async (args) => {
    log(`search_reports: ${args.keyword}`);
    try {
      const q = qs({ keyword: args.keyword, tagIds: args.tagIds, limit: args.limit ?? 10, offset: args.offset ?? 0, sorting: 'DESC', sortingType: 'created_at' });
      const [items, countData] = await Promise.all([
        apiFetch(`/report/diagnosis${q}`) as Promise<Array<Record<string, unknown>>>,
        apiFetch(`/report/diagnosis/count${q}`) as Promise<{ count: number }>,
      ]);
      const list = items.map(r =>
        `• [ID:${r.reportId}] *${r.name}*\n  ${r.dataCountKUnit ?? ''} rows | ${r.datasetSize ?? ''} | 태그: ${(r.tags as string[] ?? []).join(', ')}\n  https://dataclinic.ai/en/report/${r.reportId}`
      ).join('\n\n');
      return { content: [{ type: 'text' as const, text: `총 ${countData.count}개\n\n${list}` }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `오류: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
    }
  },
);

// ── 리포트 상세 + 종합 평가 ──────────────────────────────────────────────────
server.tool(
  'dataclinic_get_report',
  'Get a DataClinic report details and comprehensive evaluation (overall score, level grades, improvement suggestions).',
  {
    reportId: z.number().describe('Report ID (e.g. 11)'),
  },
  async (args) => {
    log(`get_report: ${args.reportId}`);
    try {
      const [detail, eval_] = await Promise.all([
        apiFetch(`/report/diagnosis/${args.reportId}`),
        apiFetch(`/report/detail/evaluation-contents${qs({ diagnosis_report_id: args.reportId })}`),
      ]);
      const d = detail as Record<string, unknown>;
      const e = eval_ as Record<string, unknown>;
      const suggestions = (e.improvementSuggestion as Array<{ name: string; description: string }> ?? [])
        .map(s => `  • ${s.name}: ${s.description}`).join('\n');
      const text = [
        `*${d.name}* (ID: ${args.reportId})`,
        `출판일: ${d.publishedDate} | 상업적 이용: ${d.commercialUse ? '가능' : '불가'}`,
        d.description ? `\n${d.description}` : '',
        `\n*종합 평가*`,
        `점수: ${e.score} (${e.scoreStatus})`,
        e.summary ? `${e.summary}` : '',
        `\n*Level 등급*`,
        `L1 무결성: ${grade(e.integrityGrade)} | 결측값: ${grade(e.missingValueGrade)} | 클래스균형: ${grade(e.classBalanceGrade)} | 통계: ${grade(e.statisticalMeasurementGrade)}`,
        `L2 DataLens: ${grade(e.level2DatalensAndImagingGrade)} | 기하: ${grade(e.level2GeometricPropertyMeasurementGrade)} | 분포: ${grade(e.level2DistributionPropertyMeasurementGrade)}`,
        `L3 DataLens: ${grade(e.level3DatalensAndImagingGrade)} | 기하: ${grade(e.level3GeometricPropertyMeasurementGrade)} | 분포: ${grade(e.level3DistributionPropertyMeasurementGrade)}`,
        suggestions ? `\n*개선 제안*\n${suggestions}` : '',
        d.pdfFilePath ? `\n📄 PDF: ${d.pdfFilePath}` : '',
        `\n🔗 https://dataclinic.ai/en/report/${args.reportId}`,
      ].filter(Boolean).join('\n');
      return { content: [{ type: 'text' as const, text }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `오류: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
    }
  },
);

// ── Level별 진단 상세 ────────────────────────────────────────────────────────
server.tool(
  'dataclinic_get_report_level',
  'Get detailed Level 1, 2, or 3 diagnostic content for a report. Returns structured summary with key metrics.',
  {
    reportId: z.number().describe('Report ID'),
    level: z.enum(['1', '2', '3']).describe('Diagnostic level (1=basic quality, 2=DataLens neural net, 3=custom domain)'),
  },
  async (args) => {
    log(`get_report_level: ${args.reportId} L${args.level}`);
    try {
      const data = await apiFetch(`/report/detail/level${args.level}-contents${qs({ id: args.reportId })}`) as Record<string, unknown>;

      let text = '';

      if (args.level === '1') {
        // ── Level 1: 기본 품질 ──
        const tableByClass = data.dataTableValuesByClass as Record<string, unknown> | undefined;
        const classData = tableByClass?.data as Record<string, number> | undefined;
        const counts = classData ? Object.values(classData) : [];
        const minCount = counts.length ? Math.min(...counts) : '-';
        const maxCount = counts.length ? Math.max(...counts) : '-';

        text = [
          `*Level 1 — 기본 품질 진단 (리포트 #${args.reportId})*`,
          '',
          `*이미지 정보*`,
          `• 크기: ${data.imageSize ?? '-'}`,
          `• 채널: ${data.imageChannel ?? '-'}`,
          '',
          `*데이터 무결성*`,
          `• 레이블 무결성: ${data.labelIntegrity ?? '-'}`,
          `• 결측값 검사: ${data.missingValueCheck ?? '-'}`,
          '',
          `*클래스 균형*`,
          `• 총 클래스 수: ${data.totalClassCount ?? '-'}`,
          tableByClass ? `• 클래스당 평균 샘플 수: ${(tableByClass.average as number)?.toFixed(1) ?? '-'}` : '',
          tableByClass ? `• 표준편차: ${(tableByClass.standardDeviation as number)?.toFixed(1) ?? '-'}` : '',
          counts.length ? `• 샘플 수 범위: ${minCount} ~ ${maxCount}` : '',
          '',
          `*차트*`,
          `• 전체 평균 이미지: ${data.overallMeanImagePath ? '있음 (dataclinic_get_chart_images로 조회)' : '없음'}`,
          `• 픽셀 히스토그램: chartId=3 (JS 렌더링, Playwright 필요)`,
          `• 클래스별 평균 이미지: ${(data.classwiseMeanImagePaths as unknown[] ?? []).length}개 클래스`,
        ].filter(v => v !== '').join('\n');

      } else if (args.level === '2') {
        // ── Level 2: 일반 DataLens ──
        const nn = data.neuralNetwork as Record<string, unknown> | undefined;
        const overallSimilarity = data.overallSimilarityMeasurementSampleImages as Record<string, unknown> | undefined;
        const overallOutlier = data.overallOutlierSampleImages as Record<string, unknown> | undefined;
        const classwiseDensity = data.classwiseDensityChartImages as unknown[] ?? [];

        text = [
          `*Level 2 — DataLens 분석 (리포트 #${args.reportId})*`,
          '',
          `*신경망 (DataLens)*`,
          nn ? `• 모델: ${nn.name ?? '-'}` : '',
          `• 관측 차원: ${data.observedDimensions ?? '-'}`,
          `• 이미징 방식: ${data.dataImaging ?? '-'}`,
          '',
          `*클래스 수*: ${data.totalClassCount ?? '-'}`,
          '',
          `*유사도 측정 샘플*`,
          overallSimilarity ? `• 전체 기준 nearest 그룹: ${(overallSimilarity.nearestTotal as unknown[] ?? []).length}개` : '',
          overallSimilarity ? `• 전체 기준 farthest 그룹: ${(overallSimilarity.farthestTotal as unknown[] ?? []).length}개` : '',
          `  → dataclinic_get_similar_samples로 이미지 조회 가능`,
          '',
          `*이상치 샘플*`,
          overallOutlier ? `• 고밀도 이상치: ${(overallOutlier.highDensity as unknown[] ?? []).length}개` : '',
          overallOutlier ? `• 저밀도 이상치: ${(overallOutlier.lowDensity as unknown[] ?? []).length}개` : '',
          `  → dataclinic_get_outlier_samples로 이미지 조회 가능`,
          '',
          `*차트*`,
          `• PCA 전체 분포: ${data.overallChartImagePath ? 'CDN 있음' : '없음'} (chartId=4) — 클래스별 분리도`,
          `• 전체 밀도 플롯: ${data.overallDensityChartImage ? 'CDN 있음' : '없음'} (chartId=6) — 클러스터 위치/개수`,
          `• 클래스별 밀도 플롯: ${classwiseDensity.length}개 (CDN)`,
          `• Manifold 형상 측정: chartId=5 (JS 렌더링) — 거시적 구조`,
          `• 거리-밀도 분포: chartId=8 (JS 렌더링) — 이상치 탐지용`,
          `• 밀도 등고선: chartId=9 (JS 렌더링) — 클러스터 경계`,
          `• 밀도 히스토그램: chartId=13 (JS 렌더링) — 분포 형태(종형 여부 등)`,
          `• 밀도 박스 차트: chartId=15 (JS 렌더링) — 클래스별 분포 비교`,
          ``,
          `→ 다음: dataclinic_get_chart_images(level="2")로 CDN 이미지 + JS 차트 목록 확인 후 모두 표시할 것`,
        ].filter(v => v !== '').join('\n');

      } else {
        // ── Level 3: 특화 DataLens ──
        const overallSimilarity = data.overallSimilarityMeasurementSampleImages as Record<string, unknown> | undefined;
        const overallOutlier = data.overallOutlierSampleImages as Record<string, unknown> | undefined;
        const classwiseDensity = data.classwiseDensityChartImages as unknown[] ?? [];

        text = [
          `*Level 3 — 특화 DataLens 분석 (리포트 #${args.reportId})*`,
          '',
          `*DataLens 설정*`,
          `• 관측 차원: ${data.observedDimensions ?? '-'}`,
          `• 처리 유형: ${data.datalensProcessingType ?? '-'}`,
          `• 이미징 방식: ${data.dataImaging ?? '-'}`,
          '',
          `*클래스 수*: ${data.totalClassCount ?? '-'}`,
          '',
          `*유사도 측정 샘플*`,
          overallSimilarity ? `• 전체 기준 nearest 그룹: ${(overallSimilarity.nearestTotal as unknown[] ?? []).length}개` : '',
          overallSimilarity ? `• 전체 기준 farthest 그룹: ${(overallSimilarity.farthestTotal as unknown[] ?? []).length}개` : '',
          `  → dataclinic_get_similar_samples로 이미지 조회 가능`,
          '',
          `*이상치 샘플*`,
          overallOutlier ? `• 고밀도 이상치: ${(overallOutlier.highDensity as unknown[] ?? []).length}개` : '',
          overallOutlier ? `• 저밀도 이상치: ${(overallOutlier.lowDensity as unknown[] ?? []).length}개` : '',
          `  → dataclinic_get_outlier_samples로 이미지 조회 가능`,
          '',
          `*차트*`,
          `• PCA 전체 분포: ${data.overallChartImagePath ? 'CDN 있음' : '없음'} (chartId=16) — 클래스별 분리도`,
          `• 전체 밀도 플롯: ${data.overallDensityChartImage ? 'CDN 있음' : '없음'} (chartId=18) — 클러스터 위치/개수`,
          `• 클래스별 밀도 플롯: ${classwiseDensity.length}개 (CDN)`,
          `• Manifold 형상 측정: chartId=17 (JS 렌더링) — 거시적 구조`,
          `• 거리-밀도 분포: chartId=19 (JS 렌더링) — 이상치 탐지용`,
          `• 밀도 등고선: chartId=20 (JS 렌더링) — 클러스터 경계`,
          `• 밀도 히스토그램: chartId=23 (JS 렌더링) — 분포 형태(종형 여부 등)`,
          `• 밀도 박스 차트: chartId=24 (JS 렌더링) — 클래스별 분포 비교`,
          ``,
          `→ 다음: dataclinic_get_chart_images(level="3")로 CDN 이미지 + JS 차트 목록 확인 후 모두 표시할 것`,
        ].filter(v => v !== '').join('\n');
      }

      return { content: [{ type: 'text' as const, text }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `오류: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
    }
  },
);

// ── 차트 이미지 URL 조회 ─────────────────────────────────────────────────────
server.tool(
  'dataclinic_get_chart_images',
  `Get chart images for a DataClinic report level.
Returns two sections:
1. CDN static images — use send_image to display inline in Slack
2. JS-rendered charts — these have NO CDN URL; must use Playwright screenshot (agent-browser)

IMPORTANT: 밀도 등고선(contour lines), 히스토그램, 박스 차트는 항상 JS 렌더링 전용. CDN에 없음.`,
  {
    reportId: z.number().describe('Report ID (e.g. 11)'),
    level: z.enum(['1', '2', '3']).describe('Diagnostic level'),
    className: z.string().optional().describe('Filter to specific class name for classwise images. Omit for overall charts.'),
  },
  async (args) => {
    log(`get_chart_images: report=${args.reportId} level=${args.level} class=${args.className}`);
    try {
      const data = await apiFetch(`/report/detail/level${args.level}-contents${qs({ id: args.reportId })}`) as Record<string, unknown>;
      const { cdnImages, jsCharts } = extractLevelChartInfo(data, args.level);

      let filtered = cdnImages;
      if (args.className) {
        const needle = args.className.toUpperCase().replace(/ /g, '');
        filtered = cdnImages.filter(item => {
          const haystack = (item.label + item.url).toUpperCase().replace(/[% ]/g, '');
          return haystack.includes(needle);
        });
      }

      const lines: string[] = [
        `*Level ${args.level} 차트 — 리포트 #${args.reportId}*${args.className ? ` (클래스: ${args.className})` : ''}`,
        '',
      ];

      if (filtered.length > 0) {
        lines.push(`*CDN 정적 이미지 (send_image로 표시 가능)*`);
        filtered.forEach((img, i) => {
          lines.push(`${i + 1}. ${img.label}`);
          lines.push(`   ${img.url}`);
        });
      } else {
        lines.push('CDN 이미지 없음' + (args.className ? ` (클래스 "${args.className}")` : ''));
      }

      // Show JS charts only when not filtering by class (they're all-class charts)
      if (!args.className && jsCharts.length > 0) {
        lines.push('');
        lines.push(`⛔ JS 렌더링 차트 — CDN URL 없음. send_image/agent-browser 사용 금지.`);
        lines.push(`각 차트마다 dataclinic_render_chart 툴을 호출할 것:`);
        jsCharts.forEach((c) => {
          lines.push(`  dataclinic_render_chart(reportId=${args.reportId}, chartId=${c.chartId}, label="${c.label}")`);
        });
      }

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `오류: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
    }
  },
);

// ── 이상치 샘플 조회 ─────────────────────────────────────────────────────────
server.tool(
  'dataclinic_get_outlier_samples',
  'Get outlier samples from a DataClinic report (density-based). High-density samples are the most "typical" images; low-density samples are unusual/anomalous ones. These are actual dataset images, not charts.',
  {
    reportId: z.number().describe('Report ID'),
    level: z.number().describe('DataLens level: 2 or 3'),
    type: z.enum(['high_density', 'low_density', 'both']).describe('"high_density"=typical core samples, "low_density"=anomalous outliers, "both"=show both'),
    limit: z.number().optional().describe('Max samples per type (default 6)'),
  },
  async (args) => {
    log(`get_outlier_samples: report=${args.reportId} level=${args.level} type=${args.type}`);
    try {
      // Fetch from level content (embedded in response, no extra API call needed)
      const data = await apiFetch(`/report/detail/level${args.level}-contents${qs({ id: args.reportId })}`) as Record<string, unknown>;
      const outliers = data.overallOutlierSampleImages as Record<string, Array<Record<string, unknown>>> | undefined;

      if (!outliers) {
        return { content: [{ type: 'text' as const, text: '이상치 샘플 데이터가 없습니다.' }] };
      }

      const limit = args.limit ?? 6;
      const lines: string[] = [`*Level ${args.level} 이상치 샘플 — 리포트 #${args.reportId}*`, ''];

      const formatSamples = (samples: Array<Record<string, unknown>>, label: string) => {
        lines.push(`*${label}*`);
        samples.slice(0, limit).forEach((s, i) => {
          const imgPath = s.image_path as string | undefined;
          const cdnUrl = imgPath ? encodeCdnUrl(CDN_BASE + imgPath) : null;
          lines.push(`${i + 1}. ${s.name ?? s.class ?? '?'} (class: ${s.class ?? '-'}, density: ${typeof s.density === 'number' ? s.density.toFixed(4) : '-'})`);
          if (cdnUrl) lines.push(`   이미지: ${cdnUrl}`);
        });
        lines.push('');
      };

      if (args.type === 'high_density' || args.type === 'both') {
        formatSamples(outliers.highDensity ?? [], '고밀도 (핵심/전형적 샘플)');
      }
      if (args.type === 'low_density' || args.type === 'both') {
        formatSamples(outliers.lowDensity ?? [], '저밀도 (이상치/특이 샘플)');
      }

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `오류: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
    }
  },
);

// ── 유사도 기반 샘플 조회 ────────────────────────────────────────────────────
server.tool(
  'dataclinic_get_similar_samples',
  'Get nearest (most similar) or farthest (most dissimilar) sample images based on embedding distance. Useful for understanding data clustering and diversity.',
  {
    reportId: z.number().describe('Report ID'),
    level: z.number().describe('DataLens level: 2 or 3'),
    type: z.enum(['nearest', 'farthest']).describe('"nearest"=most similar clusters, "farthest"=most dissimilar/diverse pairs'),
    scope: z.enum(['overall', 'classwise']).describe('"overall"=across all classes, "classwise"=within same class'),
    limit: z.number().optional().describe('Number of pivot groups to show (default 3)'),
  },
  async (args) => {
    log(`get_similar_samples: report=${args.reportId} level=${args.level} type=${args.type} scope=${args.scope}`);
    try {
      const data = await apiFetch(`/report/detail/level${args.level}-contents${qs({ id: args.reportId })}`) as Record<string, unknown>;

      const key = args.scope === 'overall'
        ? 'overallSimilarityMeasurementSampleImages'
        : 'classwiseSimilarityMeasurementSampleImages';

      const similarity = data[key] as Record<string, Array<Record<string, unknown>>> | undefined;

      if (!similarity) {
        return { content: [{ type: 'text' as const, text: '유사도 샘플 데이터가 없습니다.' }] };
      }

      const groups = (args.type === 'nearest' ? similarity.nearestTotal : similarity.farthestTotal) ?? [];
      const limit = args.limit ?? 3;
      const typeLabel = args.type === 'nearest' ? '가장 가까운 (유사)' : '가장 먼 (비유사)';
      const scopeLabel = args.scope === 'overall' ? '전체 기준' : '동일 클래스 내';

      const lines: string[] = [
        `*Level ${args.level} 유사도 샘플 — ${scopeLabel} ${typeLabel} (리포트 #${args.reportId})*`,
        '',
      ];

      groups.slice(0, limit).forEach((group, gi) => {
        const pivot = group.pivot as Record<string, unknown> | undefined;
        const neighbors = group.neighbors as Array<Record<string, unknown>> ?? [];

        if (pivot) {
          const pivotImg = pivot.image_path as string | undefined;
          lines.push(`*그룹 ${gi + 1} — 기준 이미지: ${pivot.name ?? '?'} (${pivot.class ?? '-'})*`);
          if (pivotImg) lines.push(`  기준: ${encodeCdnUrl(CDN_BASE + pivotImg)}`);
        }

        neighbors.slice(0, 4).forEach((n, ni) => {
          const nImg = n.image_path as string | undefined;
          lines.push(`  ${ni + 1}. ${n.name ?? '?'} (${n.class ?? '-'}, density: ${typeof n.density === 'number' ? n.density.toFixed(4) : '-'})`);
          if (nImg) lines.push(`     ${encodeCdnUrl(CDN_BASE + nImg)}`);
        });
        lines.push('');
      });

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `오류: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
    }
  },
);

// ── 클래스 목록 조회 ─────────────────────────────────────────────────────────
server.tool(
  'dataclinic_get_classes',
  'Get the list of class names (categories) available in a DataClinic report. Use this to find valid class names before calling dataclinic_get_chart_images with a className.',
  {
    reportId: z.number().describe('Report ID'),
    search: z.string().optional().describe('Optional keyword to filter class names'),
    limit: z.number().optional().describe('Max number of results (default 20)'),
  },
  async (args) => {
    log(`get_classes: report=${args.reportId} search=${args.search}`);
    try {
      const data = await apiFetch(`/report/detail/level1-contents${qs({ id: args.reportId })}`);
      const d = data as Record<string, unknown>;
      const classPaths = (d.classwiseMeanImagePaths as Array<{ className: string }> ?? []);
      let classes = classPaths.map(c => c.className);

      if (args.search) {
        const needle = args.search.toLowerCase();
        classes = classes.filter(c => c.toLowerCase().includes(needle));
      }

      const limit = args.limit ?? 20;
      const total = classes.length;
      const shown = classes.slice(0, limit);

      const text = [
        `Report #${args.reportId} — ${total} classes${args.search ? ` matching "${args.search}"` : ''}:`,
        shown.join(', '),
        total > limit ? `\n... and ${total - limit} more. Use search= to filter.` : '',
      ].filter(Boolean).join('\n');

      return { content: [{ type: 'text' as const, text }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `오류: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
    }
  },
);

// ── 차트 목록 조회 ───────────────────────────────────────────────────────────
server.tool(
  'dataclinic_get_chart_list',
  'Get the list of available chart types with their IDs and descriptions. Use this before calling dataclinic_get_chart to find the chartId.',
  {},
  async () => {
    log('get_chart_list');
    try {
      const charts = await apiFetch('/chart/list') as Array<{ chartId: number; level: number; description: string }>;
      const text = charts.map(c => `• [chartId:${c.chartId}] L${c.level} — ${c.description}`).join('\n');
      return { content: [{ type: 'text' as const, text: `*차트 종류 목록*\n\n${text}` }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `오류: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
    }
  },
);

// ── 차트 데이터 ──────────────────────────────────────────────────────────────
server.tool(
  'dataclinic_get_chart',
  'Get chart data for a report. Use dataclinic_get_chart_list first to get the chartId. For classwise charts, provide a class_name.',
  {
    reportId: z.number().describe('Report ID (diagnosis_report_id)'),
    chartId: z.number().describe('Chart type ID from dataclinic_get_chart_list'),
    chartType: z.enum(['overall', 'classwise']).describe('"overall" for aggregate stats, "classwise" for per-class breakdown'),
    className: z.string().optional().describe('Class name (required for classwise charts)'),
  },
  async (args) => {
    log(`get_chart: report=${args.reportId} chart=${args.chartId} type=${args.chartType}`);
    try {
      let endpoint: string;
      if (args.chartType === 'classwise') {
        if (!args.className) throw new Error('className is required for classwise charts');
        endpoint = `/chart/classwise${qs({ diagnosis_report_id: args.reportId, diagnosis_report_chart_id: args.chartId, class_name: args.className })}`;
      } else {
        endpoint = `/chart/overall${qs({ diagnosis_report_id: args.reportId, diagnosis_report_chart_id: args.chartId })}`;
      }
      const data = await apiFetch(endpoint);
      return { content: [{ type: 'text' as const, text: `*차트 데이터 (${args.chartType}, chartId=${args.chartId}) — 리포트 #${args.reportId}*\n\n${JSON.stringify(data, null, 2)}` }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `오류: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
    }
  },
);

// ── 차트 렌더링 (Python matplotlib) ─────────────────────────────────────────
server.tool(
  'dataclinic_render_chart',
  'Fetch chart data from DataClinic API and render it as a PNG image using matplotlib. Automatically sends the image to Slack via IPC. Use this instead of Playwright for JS-rendered charts (chartId 3,5,8,9,13,15,17,19,20,23,24).',
  {
    reportId: z.number().describe('Report ID'),
    chartId: z.number().describe('Chart ID (3=pixel histogram, 9/20=contour, 13/23=density histogram, 15/24=box chart, 5/17=manifold, 8/19=distance-density)'),
    label: z.string().optional().describe('Chart label for Slack message (optional)'),
  },
  async (args) => {
    const { execSync } = await import('child_process');
    const fs = await import('fs');
    const path = await import('path');

    log(`render_chart: report=${args.reportId} chartId=${args.chartId}`);
    try {
      // 1. Fetch chart data
      const endpoint = `/chart/overall${qs({ diagnosis_report_id: args.reportId, diagnosis_report_chart_id: args.chartId })}`;
      const rawData = await apiFetch(endpoint) as Record<string, unknown>;

      // 2. Write data to temp file (avoid shell escaping issues with large JSON)
      const tmpData = `/tmp/chart-data-${args.chartId}-${Date.now()}.json`;
      fs.writeFileSync(tmpData, JSON.stringify(rawData.data ?? rawData));

      // 3. Render chart
      const outDir = '/workspace/group/screenshots';
      fs.mkdirSync(outDir, { recursive: true });
      const fname = `chart-${args.reportId}-L-${args.chartId}.png`;
      const outPath = path.join(outDir, fname);

      execSync(`python3 /app/render_chart.py --chart-id ${args.chartId} --data @${tmpData} --output ${outPath}`, { timeout: 30000 });
      fs.unlinkSync(tmpData);

      // 4. Send via IPC
      const chatJid = process.env.NANOCLAW_CHAT_JID;
      if (chatJid) {
        const label = args.label ?? `DataClinic 차트 (chartId=${args.chartId})`;
        const ipcMsg = JSON.stringify({ type: 'file', chatJid, filePath: `/workspace/group/screenshots/${fname}`, altText: label });
        const ipcPath = `/workspace/ipc/messages/chart-${args.reportId}-${args.chartId}-${Date.now()}.json`;
        const tmp = ipcPath + '.tmp';
        fs.writeFileSync(tmp, ipcMsg);
        fs.renameSync(tmp, ipcPath);
        return { content: [{ type: 'text' as const, text: `✅ 차트 렌더링 완료 → Slack 전송 중 (${fname})` }] };
      } else {
        return { content: [{ type: 'text' as const, text: `✅ 차트 렌더링 완료: ${outPath} (NANOCLAW_CHAT_JID 없어서 Slack 전송 생략)` }] };
      }
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `❌ 렌더링 실패: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
    }
  },
);

// ── 최신 리포트 알림용 ───────────────────────────────────────────────────────
server.tool(
  'dataclinic_list_new_reports',
  'Get recently published DataClinic reports for monitoring/notifications. Optionally filter by publishedDate.',
  {
    limit: z.number().optional().describe('Number of reports to return (default 5)'),
    since: z.string().optional().describe('Only return reports published on or after this date (YYYY.MM.DD or YYYY-MM-DD)'),
  },
  async (args) => {
    log(`list_new_reports: since=${args.since}`);
    try {
      const q = qs({ limit: args.limit ?? 10, offset: 0, sorting: 'DESC', sortingType: 'created_at' });
      const items = await apiFetch(`/report/diagnosis${q}`) as Array<Record<string, unknown>>;
      const normalized = (s: string) => s.replace(/\./g, '-');
      const filtered = args.since
        ? items.filter(r => normalized(r.publishedDate as string ?? '') >= normalized(args.since!))
        : items;
      if (filtered.length === 0) {
        return { content: [{ type: 'text' as const, text: '새 리포트 없음' }] };
      }
      const text = filtered.map(r =>
        `• [ID:${r.reportId}] *${r.name}*\n  ${r.publishedDate} | 태그: ${(r.tags as string[] ?? []).join(', ')}\n  https://dataclinic.ai/en/report/${r.reportId}`
      ).join('\n\n');
      return { content: [{ type: 'text' as const, text: `최신 리포트 ${filtered.length}건:\n\n${text}` }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `오류: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
    }
  },
);

// ── 데이터셋 상세 정보 (설명보기 모달) ──────────────────────────────────────
server.tool(
  'dataclinic_get_dataset_info',
  `Get dataset description and metadata for a DataClinic report. Returns the dataset name, description text, collage image URL, source info, and diagnostic stats. This is the data shown in the "데이터셋 설명보기" modal on the report page.

Flow: reportId → /report/diagnosis/{reportId} (gets datasetId) → /dataset/detail/{datasetId} (gets full info).
Always up-to-date; no hardcoded mapping needed.`,
  {
    reportId: z.number().describe('Report ID (e.g. 11 for Birds 450)'),
  },
  async (args) => {
    log(`get_dataset_info: report=${args.reportId}`);
    try {
      // Step 1: get datasetId from report
      const report = await apiFetch(`/report/diagnosis/${args.reportId}`) as Record<string, unknown>;
      const datasetId = report.datasetId as number | undefined;
      if (!datasetId) {
        return { content: [{ type: 'text' as const, text: `리포트 #${args.reportId}에 연결된 데이터셋 정보가 없습니다.` }] };
      }

      // Step 2: get full dataset detail
      const d = await apiFetch(`/dataset/detail/${datasetId}`) as Record<string, unknown>;
      const diag = d.diagnosisDataset as Record<string, unknown> | undefined;
      const collageUrl = d.collageImagePath ? encodeCdnUrl(CDN_BASE + (d.collageImagePath as string)) : null;
      const thumbUrl = d.thumbnail ? encodeCdnUrl(CDN_BASE + (d.thumbnail as string)) : null;

      const lines = [
        `*${d.name}* (datasetId: ${datasetId}, reportId: ${args.reportId})`,
        '',
        d.description ? `📝 ${d.description}` : '',
        '',
        `*기본 정보*`,
        `• 이미지 수: ${d.count ? Number(d.count).toLocaleString() : '-'}장`,
        `• 크기: ${d.size ?? '-'} ${d.sizeUnit ?? ''}`,
        `• 태그: ${([...(d.subjectTags as string[] ?? []), ...(d.typeTags as string[] ?? []), ...(d.taskTags as string[] ?? [])]).join(', ')}`,
        d.sourceUrl ? `• 출처: ${d.sourceName ?? ''} — ${d.sourceUrl}` : (d.sourceName ? `• 출처: ${d.sourceName}` : ''),
        '',
        diag ? `*진단 데이터셋*` : '',
        diag ? `• 진단 이미지 수: ${Number(diag.diagnosisDataCount).toLocaleString()}장` : '',
        diag ? `• 클래스 수: ${diag.diagnosisDatasetClassCount ?? '-'}` : '',
        diag ? `• 채널: ${diag.diagonosisChannel ?? '-'}` : '',
        diag ? `• 클래스 단위 진단: ${diag.classUnitDiagnosisYn === 'Y' ? '예' : '아니오'}` : '',
        '',
        collageUrl ? `*대표 콜라주 이미지*\n${collageUrl}` : '',
        thumbUrl ? `*썸네일*\n${thumbUrl}` : '',
        '',
        `🔗 https://dataclinic.ai/en/report/${args.reportId}`,
        `🔗 https://dataclinic.ai/ko/data-set/${datasetId}`,
      ].filter(v => v !== '').join('\n');

      return { content: [{ type: 'text' as const, text: lines }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `오류: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
    }
  },
);

// ── 데이터셋 검색 ────────────────────────────────────────────────────────────
server.tool(
  'dataclinic_search_datasets',
  'Search DataClinic datasets by keyword or tags.',
  {
    keyword: z.string().optional().describe('Search keyword'),
    tagIds: z.string().optional().describe('Comma-separated tag IDs'),
    limit: z.number().optional().describe('Number of results (default 10)'),
    offset: z.number().optional().describe('Pagination offset'),
  },
  async (args) => {
    log(`search_datasets: ${args.keyword}`);
    try {
      const q = qs({ keyword: args.keyword, tagIds: args.tagIds, limit: args.limit ?? 10, offset: args.offset ?? 0 });
      const [items, countData] = await Promise.all([
        apiFetch(`/dataset/items${q}`) as Promise<Array<Record<string, unknown>>>,
        apiFetch(`/dataset/count${q}`) as Promise<{ count: number }>,
      ]);
      const list = items.map(d =>
        `• [ID:${d.datasetId}] *${d.name}*\n  ${d.dataCountKUnit ?? ''} rows | ${d.datasetSize ?? ''} | 태그: ${(d.tags as string[] ?? []).join(', ')}`
      ).join('\n\n');
      return { content: [{ type: 'text' as const, text: `총 ${countData.count}개\n\n${list}` }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `오류: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
    }
  },
);

// ── 필터 옵션 ────────────────────────────────────────────────────────────────
server.tool(
  'dataclinic_get_filters',
  'Get available filter tags and categories for searching reports and datasets.',
  {},
  async () => {
    log('get_filters');
    try {
      const [rf, df] = await Promise.all([
        apiFetch('/report/filter-data'),
        apiFetch('/dataset/filter-data'),
      ]);
      const toArr = (val: unknown): Array<Record<string, unknown>> => {
        if (Array.isArray(val)) return val as Array<Record<string, unknown>>;
        if (val && typeof val === 'object') {
          const obj = val as Record<string, unknown>;
          for (const key of ['data', 'items', 'list', 'tags', 'filters']) {
            if (Array.isArray(obj[key])) return obj[key] as Array<Record<string, unknown>>;
          }
        }
        return [];
      };
      const fmt = (f: unknown) => {
        const arr = toArr(f);
        return arr.length
          ? arr.map(x => `  [ID:${x.tagId}] ${x.tagName} (${x.tagCategoryName})`).join('\n')
          : '(없음)';
      };
      return { content: [{ type: 'text' as const, text: `*리포트 태그*\n${fmt(rf)}\n\n*데이터셋 태그*\n${fmt(df)}` }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `오류: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
    }
  },
);

// ── 내 진단 요청 상태 (로그인 필요) ─────────────────────────────────────────
server.tool(
  'dataclinic_get_my_diagnoses',
  'Get status of your submitted diagnosis requests. Requires DATACLINIC_TOKEN env var (Firebase JWT).',
  {
    limit: z.number().optional().describe('Number of results (default 10)'),
  },
  async (args) => {
    if (!FIREBASE_TOKEN) {
      return { content: [{ type: 'text' as const, text: '로그인 필요: DATACLINIC_TOKEN 환경변수가 설정되지 않았습니다.' }], isError: true };
    }
    log('get_my_diagnoses');
    try {
      const q = qs({ limit: args.limit ?? 10, offset: 0 });
      const [items, countData] = await Promise.all([
        apiFetch(`/diagnosis/status/list${q}`) as Promise<Array<Record<string, unknown>>>,
        apiFetch('/diagnosis/status/list/count') as Promise<{ count: number }>,
      ]);
      const list = items.map(d =>
        `• *${d.name ?? d.datasetName}* — ${d.status}\n  요청일: ${d.createdAt ?? ''}`
      ).join('\n\n');
      return { content: [{ type: 'text' as const, text: `내 진단 요청 ${countData.count}건\n\n${list}` }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `오류: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
    }
  },
);

// ── 전체 데이터 수집 (collected.json 생성) ───────────────────────────────────
server.tool(
  'dataclinic_collect',
  `Collect all data for a DataClinic report and save as collected.json.
Gathers report metadata, grades, L1/L2/L3 diagnostics, outliers, similarity samples,
and class list into a single structured file matching the dc-collect pipeline format.
Use this before dc-analyze or dc-write-ko.`,
  {
    reportId: z.number().describe('Report ID to collect'),
    outputPath: z.string().optional().describe('Output file path (default: /workspace/agent/collected-{reportId}.json)'),
  },
  async (args) => {
    const fs = await import('fs');
    log(`collect: report=${args.reportId}`);
    try {
      const [report, eval_] = await Promise.all([
        apiFetch(`/report/diagnosis/${args.reportId}`) as Promise<Record<string, unknown>>,
        apiFetch(`/report/detail/evaluation-contents${qs({ diagnosis_report_id: args.reportId })}`).catch(() => null),
      ]);

      const datasetId = report.datasetId as number;

      const [datasetInfo, l1, l2, l3] = await Promise.all([
        apiFetch(`/dataset/detail/${datasetId}`).catch(() => null) as Promise<Record<string, unknown> | null>,
        apiFetch(`/report/detail/level1-contents${qs({ id: args.reportId })}`).catch(() => null) as Promise<Record<string, unknown> | null>,
        apiFetch(`/report/detail/level2-contents${qs({ id: args.reportId })}`).catch(() => null) as Promise<Record<string, unknown> | null>,
        apiFetch(`/report/detail/level3-contents${qs({ id: args.reportId })}`).catch(() => null) as Promise<Record<string, unknown> | null>,
      ]);

      const e = eval_ as Record<string, unknown> | null;
      const d = datasetInfo as Record<string, unknown> | null;

      const grades = e ? {
        L1_integrity: e.integrityGrade,
        L1_missingValue: e.missingValueGrade,
        L1_classBalance: e.classBalanceGrade,
        L1_statistics: e.statisticalMeasurementGrade,
        L2_dataLens: e.level2DatalensAndImagingGrade,
        L2_geometry: e.level2GeometricPropertyMeasurementGrade,
        L2_distribution: e.level2DistributionPropertyMeasurementGrade,
        L3_dataLens: e.level3DatalensAndImagingGrade,
        L3_geometry: e.level3GeometricPropertyMeasurementGrade,
        L3_distribution: e.level3DistributionPropertyMeasurementGrade,
      } : {};

      const classList: Array<Record<string, unknown>> = [];
      if (l1) {
        const classPaths = (l1.classwiseMeanImagePaths as Array<Record<string, unknown>> ?? []);
        const classTable = (l1.dataTableValuesByClass as { data?: Record<string, number> } | undefined)?.data ?? {};
        for (const c of classPaths) {
          const className = c.className as string;
          const meanPath = c.meanImagePath as string | undefined;
          classList.push({
            className,
            imageCount: classTable[className] ?? null,
            meanImagePath: meanPath ?? null,
            meanImageUrl: meanPath ? encodeCdnUrl(CDN_BASE + meanPath) : null,
          });
        }
      }

      const level1: Record<string, unknown> = {};
      if (l1) {
        const tableByClass = l1.dataTableValuesByClass as Record<string, unknown> | undefined;
        level1.imageSize = l1.imageSize;
        level1.imageChannel = l1.imageChannel;
        level1.labelIntegrity = l1.labelIntegrity;
        level1.missingValueCheck = l1.missingValueCheck;
        level1.totalClassCount = l1.totalClassCount;
        level1.classAverage = (tableByClass?.average as number) ?? null;
        level1.classStdDev = (tableByClass?.standardDeviation as number) ?? null;
        const overallMeanPath = l1.overallMeanImagePath as string | undefined;
        level1.overallMeanImageUrl = overallMeanPath ? encodeCdnUrl(CDN_BASE + overallMeanPath) : null;
        level1.collageUrl = encodeCdnUrl(`${CDN_BASE}diagnosis_results/result_v.1.4.0/${datasetId}/level-1/english/collage.png`);
        const meanImages: Record<string, string> = {};
        for (const c of classList) {
          if (c.meanImageUrl) meanImages[c.className as string] = c.meanImageUrl as string;
        }
        level1.classwiseMeanImages = meanImages;
      }

      const mapSamples = (arr: Array<Record<string, unknown>>) =>
        arr.slice(0, 10).map(s => ({
          name: s.name ?? s.image_path,
          class: s.class,
          density: s.density,
          imageUrl: s.image_path ? encodeCdnUrl(CDN_BASE + (s.image_path as string)) : null,
        }));

      const buildLevel = (lx: Record<string, unknown> | null, isL2: boolean): Record<string, unknown> => {
        if (!lx) return {};
        const nn = lx.neuralNetwork as Record<string, unknown> | undefined;
        const outliers = lx.overallOutlierSampleImages as Record<string, Array<Record<string, unknown>>> | undefined;
        const sim = lx.overallSimilarityMeasurementSampleImages as Record<string, unknown> | undefined;
        const cwDensity = (lx.classwiseDensityChartImages as Array<Record<string, unknown>> ?? []);
        const classwiseDensityUrls: Record<string, string> = {};
        for (const c of cwDensity) {
          const path = c.chartImagePath as string | undefined;
          if (c.className && path) classwiseDensityUrls[c.className as string] = encodeCdnUrl(CDN_BASE + path);
        }
        return {
          ...(isL2 ? { neuralNetwork: nn?.name ?? 'Wolfram' } : { datalensProcessingType: lx.datalensProcessingType }),
          observedDimensions: lx.observedDimensions,
          pcaImageUrl: lx.overallChartImagePath ? encodeCdnUrl(CDN_BASE + (lx.overallChartImagePath as string)) : null,
          overallDensityChartUrl: lx.overallDensityChartImage ? encodeCdnUrl(CDN_BASE + (lx.overallDensityChartImage as string)) : null,
          classwiseDensityUrls,
          outliers: outliers ? { highDensity: mapSamples(outliers.highDensity ?? []), lowDensity: mapSamples(outliers.lowDensity ?? []) } : undefined,
          similarity: sim ? { nearest: sim.nearestTotal, farthest: sim.farthestTotal } : undefined,
        };
      };

      const level2 = buildLevel(l2, true);
      const level3 = buildLevel(l3, false);

      const collected = {
        reportId: args.reportId,
        datasetId,
        datasetName: report.name ?? d?.name,
        datasetNameEn: (d as Record<string, unknown> | null)?.nameEn ?? null,
        totalScore: e?.score ?? null,
        totalGrade: e?.scoreStatus ?? null,
        totalClassCount: (l1?.totalClassCount ?? classList.length),
        totalImageCount: report.dataCount ?? null,
        cdnBase: CDN_BASE,
        reportUrl: `https://dataclinic.ai/ko/report/${args.reportId}`,
        resultVersion: 'result_v.1.4.0',
        grades,
        level1: Object.keys(level1).length ? level1 : undefined,
        level2: Object.keys(level2).length ? level2 : undefined,
        level3: Object.keys(level3).length ? level3 : undefined,
        classList,
        pebbloscope: { available: false, snapshotIds: [], note: 'Not checked automatically' },
        collectedAt: new Date().toISOString(),
      };

      const outPath = args.outputPath ?? `/workspace/agent/collected-${args.reportId}.json`;
      fs.writeFileSync(outPath, JSON.stringify(collected, null, 2));

      const o2 = collected.level2?.outliers as { highDensity?: unknown[]; lowDensity?: unknown[] } | undefined;
      const o3 = collected.level3?.outliers as { highDensity?: unknown[]; lowDensity?: unknown[] } | undefined;
      const summary = [
        `✅ collected.json 생성 완료: ${outPath}`,
        ``,
        `리포트 #${args.reportId}: ${collected.datasetName}`,
        `• 종합 점수: ${collected.totalScore} (${collected.totalGrade})`,
        `• 클래스: ${collected.totalClassCount}개, 이미지: ${collected.totalImageCount}장`,
        `• L2 아웃라이어: 고밀도 ${o2?.highDensity?.length ?? 0}개 / 저밀도 ${o2?.lowDensity?.length ?? 0}개`,
        `• L3 아웃라이어: 고밀도 ${o3?.highDensity?.length ?? 0}개 / 저밀도 ${o3?.lowDensity?.length ?? 0}개`,
        `• 클래스 목록: ${classList.length}개`,
      ].join('\n');

      return { content: [{ type: 'text' as const, text: summary }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `오류: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
