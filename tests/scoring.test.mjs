import test from "node:test";
import assert from "node:assert/strict";
import { evaluateJobRisk, shouldTriggerWebSearch } from "../src/scoring.mjs";
import { analyzeSearchSnippets } from "../src/websearch.mjs";
import { DEFAULT_TARGET_ROLES, evaluateJobEligibility, evaluateSalaryFit, factGuardCheck, matchResumeToJob, parseSalaryRangeK } from "../src/matcher.mjs";
import { calculateBikePlusMetroMetrics } from "../src/commute.mjs";
import { normalizeCompanyRoot } from "../src/db.mjs";
import { compareSemver } from "../src/updater.mjs";

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







