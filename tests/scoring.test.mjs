import test from "node:test";
import assert from "node:assert/strict";
import { evaluateJobRisk, shouldTriggerWebSearch } from "../src/scoring.mjs";
import { analyzeSearchSnippets } from "../src/websearch.mjs";
import { DEFAULT_TARGET_ROLES, evaluateJobEligibility, evaluateSalaryFit, factGuardCheck, matchResumeToJob, parseSalaryRangeK, pickGreetingByTemplateStyle } from "../src/matcher.mjs";
import { calculateBikePlusMetroMetrics } from "../src/commute.mjs";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { DEFAULT_FOLLOWUP_PROMPT, RESUME_ASSETS_DIR, addDeliveryLog, db, getCompanyDeliveryHistory, getJob, getResumeImageMeta, getScrapeTelemetry, getSettings, listDeliveryLogs, listKnownExternalIds, listPatrolRuns, normalizeCompanyRoot, pickBestMatchedJobForChat, recordPatrolRun, saveResumeImageMeta, updateJobRouting, upsertJob } from "../src/db.mjs";
import { buildChatCompletionsUrl } from "../src/llm.mjs";
import { abortActiveEgoTask, buildBossDeliveryScript, buildBossSearchUrl, detectBossUnavailableState, extractBossEncryptJobId, getActiveLock, isBossVerificationUrl } from "../src/ego-worker.mjs";
import { compareSemver } from "../src/updater.mjs";
import { analyzeConversationAndSuggestReplies, generateContextualReplies } from "../src/reply-advisor.mjs";

test("RED zone: 银行/金融 + 实锤第三方背调 + HRBP 应命中 A轨_真实日期版", () => {
  const job = {
    company_name: "某股份制商业银行科技子公司",
    scale: "1000-9999人",
    financing: "已上市",
    industry: "银行/金融科技",
    recruiter_title: "HRBP",
    salary_range: "18-28K",
    job_title: "AI测试工程师",
    jd_text: "要求大厂背景，入职有严格背调，负责大模型接口测试。",
  };

  const trigger = shouldTriggerWebSearch(job);
  assert.equal(trigger.required, true);

  const intel = analyzeSearchSnippets(job.company_name, [
    {
      title: "某股份制商业银行科技子公司背调流程分享",
      snippet: "某股份制商业银行科技子公司委托八方锦程做背景调查，入职前会核薪查个税App。",
      url: "https://example.com/1",
    },
  ]);
  assert.equal(intel.hit_background_check, true);
  assert.ok(intel.matched_vendors.includes("八方锦程"));

  const res = evaluateJobRisk(job, intel);
  assert.equal(res.risk_score, 100);
  assert.equal(res.zone, "RED");
  assert.equal(res.recommended_track, "A轨_真实日期版");
});

test("GREEN zone: 小厂 + 技术直招 + 急招/0到1 应命中 B轨_绿区池", () => {
  const job = {
    company_name: "广州灵犀智测科技有限公司",
    scale: "20-99人",
    financing: "不需要融资",
    industry: "人工智能",
    recruiter_title: "测试经理",
    salary_range: "14-20K",
    job_title: "AI测试工程师",
    jd_text: "急招，独立负责测试体系从0到1搭建，主要做RAG与Agent评测，非外包。",
  };

  const trigger = shouldTriggerWebSearch(job);
  assert.equal(trigger.required, false);

  const res = evaluateJobRisk(job, null);
  // 10(基础) - 15(测试经理) - 10(急招/独立负责测试/0到1) = -15 -> clamp to 0
  assert.equal(res.risk_score, 0);
  assert.equal(res.zone, "GREEN");
  assert.equal(res.recommended_track, "B轨_绿区池");
});

test("YELLOW zone: 100-499人 + HRBP + 无背调实锤 应命中 先探底后定轨", () => {
  const job = {
    company_name: "星澜智能科技有限公司",
    scale: "100-499人",
    financing: "A轮",
    industry: "企业服务",
    recruiter_title: "HRBP",
    salary_range: "15-22K",
    job_title: "AI应用测试工程师",
    jd_text: "负责智能客服问答效果评测、自动化回归。",
  };

  const intel = analyzeSearchSnippets(job.company_name, [
    {
      title: "星澜智能面试经验",
      snippet: "星澜智能科技面试两轮技术面加HR面，入职没有背调，不查个税。",
      url: "https://example.com/2",
    },
  ]);
  assert.equal(intel.hit_background_check, false);

  const res = evaluateJobRisk(job, intel);
  // 10(基础) + 10(100-499人) + 15(HRBP) = 35
  assert.equal(res.risk_score, 35);
  assert.equal(res.zone, "YELLOW");
  assert.equal(res.recommended_track, "先探底后定轨");
});

test("matchResumeToJob 输出匹配分及<=120字专属打招呼话术", () => {
  const job = {
    company_name: "星澜智能",
    job_title: "AI测试工程师",
    recruiter_title: "测试经理",
    jd_text: "熟悉 Python、Pytest、RAG 效果评测、Prompt 调优和自动化测试。",
  };
  const resume = {
    track_key: "B",
    years_label: "两年经历版",
    summary: "独立搭建 RAG 企业级知识库并负责自动化测试闭环。",
    skills: ["Python", "Pytest", "RAG", "Prompt"],
    experiences: [{ company: "示例科技", role: "测试工程师", content: "使用 Python 和 Pytest 做接口测试" }],
    projects: [{ name: "RAG知识库", role: "AI独立开发者", content: "基于 RAG 评测与 Prompt 优化" }],
    education: [],
  };
  const m = matchResumeToJob(job, resume);
  assert.ok(m.match_score >= 70);
  assert.ok(m.custom_greeting.length > 10 && m.custom_greeting.length <= 120);
  assert.ok(m.matched_keywords.some((k) => k.includes("RAG")));
});

test("大厂驻场外包 + B轮 + 猎头 应进入 RED 区", () => {
  const job = {
    company_name: "软通动力信息技术股份有限公司",
    scale: "10000人以上",
    financing: "已上市",
    industry: "计算机软件",
    recruiter_title: "猎头顾问",
    salary_range: "16-22K",
    job_title: "AI驻场测试工程师",
    jd_text: "驻场大厂测试大模型评测系统。",
  };
  const res = evaluateJobRisk(job, null);
  // 10 + 60(外包/驻场) + 35(已上市) + 15(猎头) = 120 -> clamped 100
  assert.equal(res.risk_score, 100);
  assert.equal(res.zone, "RED");
  assert.equal(res.recommended_track, "A轨_真实日期版");
});

test("负向否定表述（非外包、不背调）不应误判加分", () => {
  const job = {
    company_name: "初创智行科技有限公司",
    scale: "20-99人",
    financing: "天使轮",
    industry: "人工智能",
    recruiter_title: "CTO",
    salary_range: "15-20K",
    job_title: "AI测试工程师",
    jd_text: "自研大模型，非外包，不驻场，急招核心成员。",
  };
  const res = evaluateJobRisk(job, null);
  assert.equal(res.risk_score, 0);
  assert.equal(res.zone, "GREEN");
});

test("ASCII缩写词边界：model/product 不应误命中 OD，Data 不应误命中 TA", () => {
  const job = {
    company_name: "广州普通电商科技有限公司",
    scale: "100-499人",
    financing: "未融资",
    industry: "电子商务",
    recruiter_title: "Data经理",
    salary_range: "12-16K",
    job_title: "AI应用落地专员",
    jd_text: "负责大模型 model product 效果测试与评估。",
  };
  const res = evaluateJobRisk(job, null);
  // 10 + 10(100-499人) = 20 -> GREEN
  assert.equal(res.risk_score, 20);
  assert.equal(res.zone, "GREEN");
  assert.equal(res.recommended_track, "B轨_绿区池");
});

test("反诈/引流闸门：小白无经验+岗前实训应进入 SKIP 跳过", () => {
  const job = {
    company_name: "星途科技有限公司",
    scale: "20-99人",
    financing: "未融资",
    industry: "人工智能",
    recruiter_title: "HR",
    job_title: "AI测试工程师（接受小白无经验）",
    jd_text: "零基础可投，提供岗前实训包教包会，推荐就业。",
  };
  const res = evaluateJobRisk(job, null);
  assert.equal(res.zone, "SKIP");
  assert.equal(res.recommended_track, "跳过_疑似培训或引流");
});

test("企业黑名单与归一化主体防撞车：集团/分公司命名归一", () => {
  assert.equal(
    normalizeCompanyRoot("软通动力信息技术（集团）股份有限公司广州分公司"),
    normalizeCompanyRoot("软通动力科技有限公司")
  );
  const res = evaluateJobRisk(
    { company_name: "某黑名单公司", scale: "20-99人", jd_text: "AI测试" },
    null,
    { blacklisted: { company_name: "某黑名单公司", reason: "已屏蔽" } }
  );
  assert.equal(res.zone, "SKIP");
  assert.equal(res.recommended_track, "跳过_黑名单企业");
});

test("factGuardCheck 事实锁校验能放行正常改写并拦截篡改时间线", () => {
  const orig = {
    experiences: [{ company: "示例科技", role: "测试", period: "2024.09-2025.12", content: "测试" }],
    education: [{ school: "示例大学", degree: "本科" }],
  };
  const ok = factGuardCheck(orig, {
    experiences: [{ company: "示例科技", role: "测试", period: "2024.09-2025.12", content: "突出RAG评测" }],
    education: [{ school: "示例大学", degree: "本科" }],
  });
  assert.equal(ok.passed, true);

  const tampered = factGuardCheck(orig, {
    experiences: [{ company: "示例科技", role: "测试", period: "2023.01-2025.12", content: "突出RAG评测" }],
    education: [{ school: "示例大学", degree: "本科" }],
  });
  assert.equal(tampered.passed, false);
  assert.ok(tampered.issues.length > 0);
});

test("compareSemver 版本号比对正确", () => {
  assert.equal(compareSemver("v0.3.1", "0.3.0"), 1);
  assert.equal(compareSemver("0.3.0", "0.3.0"), 0);
  assert.equal(compareSemver("0.2.9", "0.3.0"), -1);
});

test("DEFAULT_TARGET_ROLES 包含 9 类目标巡检岗位", () => {
  assert.equal(DEFAULT_TARGET_ROLES.length, 9);
  for (const r of ["AI应用测试", "AI评测", "大模型测试工程师", "模型评测工程师", "AI训练师", "提示词工程师"]) {
    assert.ok(DEFAULT_TARGET_ROLES.includes(r));
  }
});

test("5维度匹配打分：同义词归一 + 可直接投(DIRECT_APPLY) + 3套沟通模板", () => {
  const job = {
    company_name: "灵眸智能科技有限公司",
    job_title: "大模型测试工程师",
    experience_req: "1-3年",
    education_req: "本科",
    recruiter_title: "测试经理",
    jd_text: "1.负责公司Web及移动端功能测试、编写测试用例与回归闭环；2.熟悉API测试与Python自动化脚本；3.负责大模型效果评估与提示词调优，跟踪Badcase。",
  };
  const resume2y = {
    track_key: "A",
    years_label: "2年经验",
    summary: "具备2年软件测试及自动化测试经验，独立负责Web与Android客户端全流程测试，参与Prompt与RAG问答效果验证。",
    skills: ["Python", "Pytest", "Requests", "Postman", "SQL", "Docker", "Linux"],
    experiences: [
      { company: "A科技", role: "软件测试", period: "2025.02-2026.03", content: "独立负责Web和Android功能测试、接口测试、回归测试，编写测试用例1000+条" },
      { company: "B科技", role: "测试工程师", period: "2024.06-2024.12", content: "接口自动化、性能测试与Badcase定位，Prompt调优验证" },
    ],
    projects: [{ name: "RAG问答测试平台", role: "测试负责人", content: "大模型问答准确率评测与测试用例闭环" }],
    education: [{ school: "示例大学", degree: "本科" }],
  };

  const m = matchResumeToJob(job, resume2y);
  assert.ok(m.match_score >= 76, `expected >=76, got ${m.match_score}`);
  assert.equal(m.apply_advice, "DIRECT_APPLY");
  assert.equal(m.dimensions.work_content.max, 35);
  assert.equal(m.dimensions.tech_stack.max, 25);
  assert.equal(m.dimensions.hard_gate.score, 15);
  assert.ok(m.matched_keywords.includes("接口测试"));
  assert.ok(m.matched_keywords.includes("Prompt/提示词"));
  assert.equal(m.greeting_templates.length, 3);
  for (const tpl of m.greeting_templates) {
    assert.ok(tpl.text.length > 10 && tpl.text.length <= 120);
  }
});

test("5维度匹配打分：硬性门槛超档或偏离赛道应判定 LOW_FIT", () => {
  const job = {
    company_name: "某汽车电子公司",
    job_title: "高级嵌入式测试工程师",
    experience_req: "5年以上",
    education_req: "硕士",
    recruiter_title: "HRBP",
    jd_text: "负责C++驱动、芯片验证、射频测试与汽车底盘嵌入式开发测试。",
  };
  const resume2y = {
    track_key: "A",
    years_label: "2年经验",
    summary: "2年Web与接口测试经验。",
    skills: ["Python", "Pytest", "Postman"],
    experiences: [{ company: "A科技", role: "软件测试", period: "2024.06-2026.03", content: "Web后台功能与接口测试" }],
    projects: [],
    education: [{ school: "示例大学", degree: "本科" }],
  };

  const m = matchResumeToJob(job, resume2y);
  assert.equal(m.apply_advice, "LOW_FIT");
  assert.ok(m.match_score < 55);
});

test("职位精筛漏斗：拦截实习/产品/开发/路测/5-10年，保留1-3年及强相关3-5年测试岗", () => {
  const intern = evaluateJobEligibility({
    job_title: "软件测试（实习转正）",
    experience_req: "在校/应届",
    jd_text: "协助编写测试用例与回归测试。",
  });
  assert.equal(intern.eligible, false);
  assert.equal(intern.filter_category, "INTERN_OR_PARTTIME");

  const pm = evaluateJobEligibility({
    job_title: "AI智能机柜产品经理",
    experience_req: "经验不限",
    jd_text: "负责AI智能机柜项目产品开发工作",
  });
  assert.equal(pm.eligible, false);
  assert.equal(pm.filter_category, "NON_QA_ROLE");

  const dev = evaluateJobEligibility({
    job_title: "Java开发工程师（大模型网关方向）",
    experience_req: "3-5年",
    jd_text: "负责基于 Spring Cloud 构建企业级大模型网关。",
  });
  assert.equal(dev.eligible, false);
  assert.equal(dev.filter_category, "NON_QA_ROLE");

  const driverTest = evaluateJobEligibility({
    job_title: "自动驾驶测试员",
    experience_req: "1-3年",
    jd_text: "开车测试智能驾驶系统，发现问题及时接管车辆。",
  });
  assert.equal(driverTest.eligible, false);
  assert.equal(driverTest.filter_category, "NON_QA_ROLE");

  const senior5y = evaluateJobEligibility({
    job_title: "测试工程师（SaaS ERP）",
    experience_req: "5-10年",
    jd_text: "负责功能测试与接口测试。",
  });
  assert.equal(senior5y.eligible, false);
  assert.equal(senior5y.filter_category, "EXP_OUT_OF_RANGE");

  const stretch35 = evaluateJobEligibility({
    job_title: "软件测试工程师（AI 大模型方向）",
    experience_req: "3-5年",
    jd_text: "负责AI大模型功能测试、接口自动化、测试用例设计与大模型效果评测。",
  });
  assert.equal(stretch35.eligible, true);
  assert.equal(stretch35.exp_tier, "STRETCH_3_5");

  const ideal13 = evaluateJobEligibility({
    job_title: "AI测试工程师",
    experience_req: "1-3年",
    jd_text: "负责大模型与接口自动化测试。",
  });
  assert.equal(ideal13.eligible, true);
  assert.equal(ideal13.exp_tier, "IDEAL_1_3");
});

test("短JD非测试岗不得再触发默认高分假象", () => {
  const resume2y = {
    track_key: "A",
    years_label: "2年经验",
    summary: "2年软件测试与接口自动化经验。",
    skills: ["Python", "Pytest"],
    experiences: [{ company: "A科技", role: "软件测试", period: "2024.06-2026.03", content: "功能测试、接口测试" }],
    projects: [],
    education: [{ school: "示例大学", degree: "本科" }],
  };
  const m = matchResumeToJob(
    { company_name: "某电子公司", job_title: "AI智能机柜产品经理", experience_req: "经验不限", jd_text: "负责AI智能机柜项目产品开发工作" },
    resume2y
  );
  assert.ok(m.match_score < 35, `expected <35 for off-domain PM job, got ${m.match_score}`);
  assert.equal(m.eligibility.eligible, false);
});

test("单车+地铁通勤模型：正确计算接驳节省时间与分级", () => {
  const metro = calculateBikePlusMetroMetrics({
    distanceM: 22591,
    totalSec: 3928,
    walkDistanceM: 2410,
    walkSec: 2008,
    priceFen: 600,
    straightLineM: 12800,
    lines: ["地铁13号线(天河公园-新沙)", "地铁7号线(燕山-美的大道)"],
  });
  assert.equal(metro.status, "DONE");
  assert.equal(metro.prefer_direct_bike, false);
  assert.ok(metro.bike_metro_min < metro.walk_metro_min);
  assert.ok(metro.saved_min >= 15);
  assert.equal(metro.tier, "MODERATE");

  const near = calculateBikePlusMetroMetrics({
    distanceM: 2800,
    totalSec: 2100,
    walkDistanceM: 1200,
    walkSec: 900,
    straightLineM: 2200,
    lines: ["地铁5号线"],
  });
  assert.equal(near.prefer_direct_bike, true);
  assert.equal(near.tier, "NEAR");
});

test("三段式企业尽调解析：提取工商全称、实缴资本与职场负面标签", () => {
  const res = analyzeSearchSnippets("示例游戏", {
    creditItems: [
      {
        title: "深圳示例科技有限公司 - 天眼查",
        snippet: "深圳示例科技有限公司成立于2018年，注册资本10万人民币，实缴资本0万人民币。",
        url: "https://example.com/tyc",
      },
    ],
    bgItems: [
      {
        title: "深圳示例科技有限公司入职背调",
        snippet: "深圳示例科技有限公司没有第三方背调。",
        url: "https://example.com/bg",
      },
    ],
    repItems: [
      {
        title: "在深圳示例科技有限公司工作怎么样 - 知乎",
        snippet: "深圳示例科技有限公司经常拖欠工资，内部PUA严重且大裁员。",
        url: "https://example.com/zhihu",
      },
    ],
  });
  assert.equal(res.registered_name, "深圳示例科技有限公司");
  assert.equal(res.credit.established_year, "2018");
  assert.equal(res.credit.shell_risk, true);
  assert.ok(res.reputation.negative_tags.includes("欠薪/拖欠工资"));
  assert.equal(res.reputation.health_level, "DANGER");
});

test("薪资分级与门槛：低于7K过滤，9-12K高亮且高权重加分", () => {
  assert.equal(parseSalaryRangeK("6-9K").min, 6);
  assert.equal(parseSalaryRangeK("10-12K·13薪").max, 12);

  const lowElig = evaluateJobEligibility({
    job_title: "软件测试工程师",
    salary_range: "6-9K",
    experience_req: "1-3年",
    jd_text: "负责功能测试与接口测试、测试用例编写与缺陷跟踪。",
  });
  assert.equal(lowElig.filter_status, "FILTERED");
  assert.equal(lowElig.filter_category, "SALARY_TOO_LOW");

  const idealFit = evaluateSalaryFit("10-12K");
  assert.equal(idealFit.tier, "TARGET_EXACT");
  assert.equal(idealFit.highlighted, true);
  assert.ok(idealFit.weight_bonus >= 12);

  const coverFit = evaluateSalaryFit("10-15K");
  assert.equal(coverFit.tier, "TARGET_COVER");
  assert.equal(coverFit.highlighted, true);

  const resume = {
    years_label: "2年经验",
    summary: "2年功能测试、接口测试、Python自动化和AI测试经验。",
    skills: ["Python", "Pytest", "Postman"],
    experiences: [{ company: "示例", role: "软件测试", period: "2024.06-2026.05", content: "功能测试、接口测试、测试用例编写" }],
    projects: [],
    education: [{ degree: "本科" }],
  };
  const baseJob = {
    company_name: "广州灵眸",
    job_title: "AI测试工程师",
    experience_req: "1-3年",
    education_req: "本科",
    jd_text: "负责功能测试、接口测试与测试用例编写。",
  };
  const matchIdeal = matchResumeToJob({ ...baseJob, salary_range: "10-12K" }, resume);
  const matchLow = matchResumeToJob({ ...baseJob, salary_range: "7-8K" }, resume);
  assert.equal(matchIdeal.salary_fit.tier, "TARGET_EXACT");
  assert.ok(matchIdeal.match_score > matchLow.match_score);
});

test("异地跨城与小语种翻译过滤：拦截 base杭州/base北京/芜湖 及外语翻译标注", () => {
  const hz = evaluateJobEligibility({
    job_title: "AI模型评测专家【base杭州】",
    salary_range: "13-25K",
    experience_req: "1-3年",
    jd_text: "本岗位base杭州，需长期在杭办公，负责模型评测。",
  }, { search_city_name: "广州" });
  assert.equal(hz.filter_status, "FILTERED");
  assert.equal(hz.filter_category, "REMOTE_CITY");

  const bj = evaluateJobEligibility({
    job_title: "大模型评测工程师",
    salary_range: "11-20K",
    experience_req: "1-3年",
    jd_text: "base 北京\n负责评测打分与数据标注管理。",
  }, { search_city_name: "广州" });
  assert.equal(bj.filter_status, "FILTERED");
  assert.equal(bj.filter_category, "REMOTE_CITY");

  const lang = evaluateJobEligibility({
    job_title: "小语种翻译(大模型评测)",
    salary_range: "11-20K",
    experience_req: "1-3年",
    jd_text: "菲律宾语母语者或等同母语水平，SFT文本标注。",
  });
  assert.equal(lang.filter_status, "FILTERED");
  assert.equal(lang.filter_category, "NON_QA_ROLE");
});

test("抓取记录与留存统计：patrol_runs 写入读取及额度核算", () => {
  const rec = recordPatrolRun({
    run_date: "2099-01-01",
    mode: "SINGLE",
    profiles: ["Profile 1"],
    keywords: ["AI测试"],
    planned_quota: 5,
    scanned_count: 5,
    new_count: 2,
    kept_count: 1,
    filtered_count: 4,
    status: "OK",
    summary: "test run",
  });
  try {
    assert.ok(rec.id > 0);
    const runs = listPatrolRuns(10);
    assert.ok(runs.some((r) => r.run_date === "2099-01-01" && r.kept_count === 1));
    const tel = getScrapeTelemetry();
    assert.equal(typeof tel.total_jobs, "number");
    assert.equal(typeof tel.total_kept, "number");
    assert.ok(Array.isArray(tel.by_keyword));
  } finally {
    db.prepare("DELETE FROM patrol_runs WHERE id = ?").run(rec.id);
  }
});

test("参保人数/画饼特征预警 & 增量外部ID清单：提取参保人数并检测三不限画饼信号", () => {
  const intel = analyzeSearchSnippets("新锐示例科技", {
    creditItems: [
      {
        title: "广州新锐示例科技有限公司 - 爱企查",
        snippet: "广州新锐示例科技有限公司成立于2025年，注册资本50万人民币，实缴资本0万人民币，参保人数 2 人。",
        url: "https://example.com/aqc",
      },
    ],
    bgItems: [],
    repItems: [],
  });
  assert.equal(intel.credit.insured_count, 2);
  assert.ok(intel.credit.warnings.some((w) => w.includes("参保人数极少")));
  assert.ok(intel.credit.warnings.some((w) => w.includes("新成立企业")));

  const risk = evaluateJobRisk(
    {
      company_name: "新锐示例科技",
      job_title: "AI测试工程师！！！！",
      experience_req: "经验不限",
      jd_text: "不限学历，经验不限，每周下午茶，老板人好，氛围轻松！",
    },
    intel
  );
  assert.equal(risk.parsed.hype_cake_risk, true);
  assert.ok(risk.evidence.some((e) => e.includes("画饼/草台班子预警")));
  assert.ok(risk.evidence.some((e) => e.includes("参保2人")));

  const knownIds = listKnownExternalIds();
  assert.ok(Array.isArray(knownIds));
});

test("Boss原生搜索筛选URL构建：全职1901与1-5年/不限经验参数拼接", () => {
  const url = buildBossSearchUrl({
    query: "软件测试",
    city: "101280100",
    jobType: "1901",
    experience: "101,103,104,105",
    salary: "405",
  });
  assert.ok(url.includes("city=101280100"));
  assert.ok(url.includes("jobType=1901"));
  assert.ok(url.includes("experience=101%2C103%2C104%2C105"));
  assert.ok(url.includes("salary=405"));
});

test("图片简历元数据存取：支持读取与恢复 meta.json", () => {
  const metaFile = path.join(RESUME_ASSETS_DIR, "meta.json");
  const prevMeta = fs.existsSync(metaFile) ? fs.readFileSync(metaFile, "utf8") : null;
  const mockImg = path.join(RESUME_ASSETS_DIR, "mock-test-resume.png");
  fs.writeFileSync(mockImg, Buffer.from("89504e470d0a1a0a", "hex"));
  try {
    const saved = saveResumeImageMeta({
      source_name: "mock_candidate_resume.pdf",
      image_file: "mock-test-resume.png",
      width: 1400,
      height: 1980,
    });
    assert.equal(saved.exists, true);
    assert.equal(saved.filename, "mock_candidate_resume.pdf");
    assert.equal(saved.width, 1400);
    assert.ok(saved.url.startsWith("/api/resume-image?t="));
  } finally {
    try { fs.unlinkSync(mockImg); } catch {}
    if (prevMeta !== null) fs.writeFileSync(metaFile, prevMeta, "utf8");
    else { try { fs.unlinkSync(metaFile); } catch {} }
  }
});

test("Boss安全验证识别：不误判 job_detail?securityId=，准确拦截真实验证/登录页", () => {
  const normalJobUrl = "https://www.zhipin.com/job_detail/740e2631cf032ab90nBy29W5GVVR.html?securityId=ea_knuAs84rMW-J1";
  assert.equal(isBossVerificationUrl(normalJobUrl, "测试工程师 10-15K 立即沟通"), false);
  assert.equal(isBossVerificationUrl("https://www.zhipin.com/web/user/?ka=header-login", "Boss直聘"), true);
  assert.equal(isBossVerificationUrl("https://www.zhipin.com/web/common/security-check.html", "请完成安全验证"), true);
  assert.equal(isBossVerificationUrl(normalJobUrl, "请完成安全验证 拖动滑块"), true);
});

test("沟通记录持久化和防重复检测：记录文字/图片状态并拦截同司重复", () => {
  const extId = `mock-deliv-${Date.now()}`;
  const job = upsertJob({
    external_id: extId,
    job_title: "AI应用测试工程师",
    company_name: "测试防重科技有限责任公司",
    city: "广州",
  });
  let logId = null;
  try {
    const log = addDeliveryLog({
      job_id: job.id,
      company_name: job.company_name,
      job_title: job.job_title,
      track_key: "B",
      profile_id: "Profile 1",
      action: "AUTO_SEND",
      greeting_text: "您好，对贵司测试岗很感兴趣！",
      text_sent: true,
      image_sent: false,
      image_status: "PENDING_REPLY",
      status: "DELIVERED",
      detail: "已发文字，待回复补发图片",
    });
    logId = log.id;
    const rows = listDeliveryLogs(20);
    const found = rows.find((r) => r.id === log.id);
    assert.ok(found);
    assert.equal(found.job_title, "AI应用测试工程师");
    assert.equal(found.text_sent, true);
    assert.equal(found.image_sent, false);
    assert.equal(found.image_status, "PENDING_REPLY");

    const hist = getCompanyDeliveryHistory("测试防重科技（广州）分公司");
    assert.ok(hist.some((h) => h.job_id === job.id));
  } finally {
    if (logId) db.prepare("DELETE FROM delivery_logs WHERE id = ?").run(logId);
    db.prepare("DELETE FROM jobs WHERE id = ?").run(job.id);
  }
});

test("连续对话智能回复建议：识别年限质疑/索要简历/邀约面试并生成3套贴合简历模板", () => {
  const job = {
    company_name: "绿蕃茄软件科技",
    job_title: "测试工程师",
    jd_text: "负责软件测试、接口自动化测试与Linux排查。",
    match: { matched_keywords: ["接口测试", "自动化测试", "Linux"] },
  };
  const resume = {
    years_label: "1年经验",
    summary: "独立负责AI与全链路接口测试",
    skills: ["Python", "Pytest", "Linux", "Postman"],
    experiences: [{ company: "示例科技", role: "AI应用测试工程师", content: "独立负责大模型接口批测与抓包排障" }],
    projects: [{ name: "语音智能体测试" }],
  };

  const expGap = analyzeConversationAndSuggestReplies({
    job,
    resume,
    messages: [
      { sender: "ME", text: "您好，希望有机会沟通！" },
      { sender: "HR", text: "你好，我们需要至少3年以上经验哦，感谢投递～" },
    ],
  });
  assert.equal(expGap.intent, "EXP_GAP");
  assert.equal(expGap.templates.length, 3);
  assert.ok(expGap.templates[0].text.includes("1年经验"));
  assert.ok(!expGap.templates[0].text.includes("独立独立"));

  const askRes = analyzeConversationAndSuggestReplies({
    job,
    resume,
    messages: [{ sender: "HR", text: "方便发份简历看看吗？" }],
  });
  assert.equal(askRes.intent, "ASK_RESUME");
  assert.equal(askRes.templates.length, 3);

  const iv = analyzeConversationAndSuggestReplies({
    job,
    resume,
    messages: [{ sender: "HR", text: "明天下午方便约个线下面试吗？" }],
  });
  assert.equal(iv.intent, "INTERVIEW_INVITE");
  assert.equal(iv.templates.length, 3);

  // 对方追问简历里没有重点写的技术栈（如 UI自动化多久），应坦诚过渡而不硬套“实战很多”或带项目列表符号
  const skillGap = analyzeConversationAndSuggestReplies({
    job,
    resume,
    messages: [{ sender: "HR", text: "你 ui自动化做多久呀？" }],
  });
  assert.equal(skillGap.intent, "SKILL_GAP_HONEST");
  assert.ok(!skillGap.templates[0].text.includes("实战比较多"));
  assert.ok(!skillGap.templates[0].text.includes("•"));

  // 若我方最后一条已回复对方，应识别 WAITING_AFTER_MY_REPLY 而不是重复回答老问题
  const alreadyReplied = analyzeConversationAndSuggestReplies({
    job,
    resume,
    messages: [
      { sender: "HR", text: "你 ui自动化做多久呀？" },
      { sender: "ME", time: "09:26", text: "我主要做接口和AI测试，UI自动化用得少但AI生成脚本很快" },
      { sender: "ME", kind: "image", text: "[图片消息]", imageUrl: "https://example.com/resume.png" },
    ],
  });
  assert.equal(alreadyReplied.intent, "WAITING_AFTER_MY_REPLY");
});

test("Command Code GOAT DeepSeek 默认配置与真实口语化提示词就绪", async () => {
  assert.ok(DEFAULT_FOLLOWUP_PROMPT.includes("说人话"));
  assert.ok(DEFAULT_FOLLOWUP_PROMPT.includes("严禁硬往不相关的经历上靠"));
  const s = getSettings();
  assert.equal(s.llm_base_url, "https://api.commandcode.ai/provider/v1");
  assert.equal(s.llm_model, "deepseek/deepseek-v4.1-flash-fast");
  const noKeyAdvice = await generateContextualReplies({
    job: { company_name: "测试", job_title: "测试" },
    resume: { skills: ["接口测试"] },
    messages: [{ sender: "HR", text: "你好" }],
    settings: { ...s, llm_api_key: "" },
  });
  assert.equal(noKeyAdvice.used_llm, false);
  assert.ok(noKeyAdvice.llm_notice.includes("API Key"));
  assert.equal(buildChatCompletionsUrl("https://api.commandcode.ai/provider/v1/"), "https://api.commandcode.ai/provider/v1/chat/completions");
  assert.equal(buildChatCompletionsUrl("https://api.commandcode.ai/provider/v1/chat/completions"), "https://api.commandcode.ai/provider/v1/chat/completions");
  const aborted = abortActiveEgoTask();
  assert.equal(aborted.ok, true);
  assert.equal(getActiveLock(), null);
});

test("批量投递话术风格选择：支持按 auto/direct/tech/bridge 精准取出对应话术", () => {
  const mockJob = {
    custom_greeting: "默认话术",
    match: {
      greeting_templates: [
        { key: "direct", label: "高匹配直投", text: "高匹配直投话术内容" },
        { key: "tech", label: "突出技术成果", text: "突出技术成果话术内容" },
        { key: "bridge", label: "精炼礼貌破冰", text: "精炼礼貌破冰话术内容" },
      ],
    },
  };
  assert.equal(pickGreetingByTemplateStyle(mockJob, "auto"), "默认话术");
  assert.equal(pickGreetingByTemplateStyle(mockJob, "direct"), "高匹配直投话术内容");
  assert.equal(pickGreetingByTemplateStyle(mockJob, "tech"), "突出技术成果话术内容");
  assert.equal(pickGreetingByTemplateStyle(mockJob, "bridge"), "精炼礼貌破冰话术内容");
});

test("Boss 7类会话标签状态持久化：boss_stage 与 boss_unread_count 正常读写", () => {
  const job = upsertJob({
    external_id: `mock-stage-${Date.now()}`,
    job_title: "测试工程师",
    company_name: "测试标签管理有限公司",
    city: "广州",
  });
  try {
    const updated = updateJobRouting(job.id, {
      boss_stage: "EXCHANGED",
      boss_unread_count: 2,
    });
    assert.equal(updated.boss_stage, "EXCHANGED");
    assert.equal(updated.boss_unread_count, 2);
    const reloaded = getJob(job.id);
    assert.equal(reloaded.boss_stage, "EXCHANGED");
    assert.equal(reloaded.boss_unread_count, 2);
  } finally {
    db.prepare("DELETE FROM jobs WHERE id = ?").run(job.id);
  }
});

test("聊天会话匹配：同公司多岗位只匹配唯一最佳岗位，不扇出重复记录", () => {
  const j1 = { id: 101, external_id: "ext-101", company_name: "软通动力", normalized_company: "软通动力", job_title: "大模型推理优化", source_profile_id: "Profile 2", match_score: 90 };
  const j2 = { id: 102, external_id: "ext-102", company_name: "软通动力", normalized_company: "软通动力", job_title: "软件测试工程师", source_profile_id: "Profile 2", match_score: 85 };
  const picked = pickBestMatchedJobForChat([j1, j2], [], { company_name: "软通动力", job_title: "测试工程师" }, "Profile 2");
  assert.equal(picked?.id, 102);

  // 若会话自带不同的 external_id，绝不张冠李戴匹配到本地其他岗位
  const mismatchExt = pickBestMatchedJobForChat([j1, j2], [], { external_id: "ext-999", company_name: "软通动力", job_title: "软件测试工程师" }, "Profile 2");
  assert.equal(mismatchExt, null);

  const pickedExisting = pickBestMatchedJobForChat([j1, j2], [{ job_id: 101, profile_id: "Profile 2", status: "DELIVERED" }], { company_name: "软通动力", job_title: "大模型推理优化" }, "Profile 2");
  assert.equal(pickedExisting?.id, 101);
});

test("投递脚本构建与下线职位检测：避免 onlySendImage ReferenceError，进入聊天页发图，并记录失败日志不误耗额度", () => {
  assert.equal(detectBossUnavailableState({ title: "您访问的页面不存在-BOSS直聘", bodyText: "Oops! 您访问的页面不存在～", pathname: "/job_detail/abc.html", hasChatButton: false }), true);
  assert.equal(detectBossUnavailableState({ title: "测试工程师", bodyText: "职位职责...", pathname: "/job_detail/abc.html", hasChatButton: true }), false);
  assert.equal(detectBossUnavailableState({ title: "搜索职位", bodyText: "", pathname: "/web/geek/jobs", hasChatButton: false }), false);
  assert.equal(extractBossEncryptJobId("https://www.zhipin.com/job_detail/be30b7cc7d40723b0nF_3dm9FlJQ.html?ka=search"), "be30b7cc7d40723b0nF_3dm9FlJQ");

  const script = buildBossDeliveryScript({
    profileId: "Profile 2",
    jobUrl: "https://www.zhipin.com/job_detail/be30b7cc7d40723b0nF_3dm9FlJQ.html",
    companyName: "阿里巴巴",
    jobTitle: "AI模型评测",
    greetingText: "您好，对贵司AI评测岗非常感兴趣！",
    autoSend: true,
    sendImageResume: true,
    imagePath: "",
    onlySendImage: false,
  });
  assert.match(script, /const onlySendImage = false;/);
  assert.match(script, /JOB_UNAVAILABLE/);
  assert.match(script, /web\/geek\/chat/);
  assert.doesNotThrow(() => new vm.Script(`async function _check() {\n${script}\n}`));

  const { id: failJobId } = upsertJob({
    external_id: "test-fail-log-001",
    job_url: "https://www.zhipin.com/job_detail/testfaillog.html",
    job_title: "离线测试工程师",
    company_name: "示例已下线科技公司",
    salary_range: "9-10K",
    experience_req: "1-3年",
  });
  let logId = null;
  try {
    const insertedLog = addDeliveryLog({
      job_id: failJobId,
      company_name: "示例已下线科技公司",
      job_title: "离线测试工程师",
      track_key: "B",
      profile_id: "Profile 2",
      action: "AUTO_SEND",
      greeting_text: "您好",
      text_sent: false,
      image_sent: false,
      image_status: "NONE",
      status: "FAILED",
      detail: "Boss 上该职位已下线或停止招聘，无法发起沟通",
    });
    logId = insertedLog.id;
    const logs = listDeliveryLogs(10);
    const failedRow = logs.find((l) => l.job_id === failJobId && l.status === "FAILED");
    assert.ok(failedRow);
    assert.equal(getCompanyDeliveryHistory("示例已下线科技公司").length, 0);
  } finally {
    if (logId) db.prepare("DELETE FROM delivery_logs WHERE id = ?").run(logId);
    db.prepare("DELETE FROM jobs WHERE id = ?").run(failJobId);
  }
});










