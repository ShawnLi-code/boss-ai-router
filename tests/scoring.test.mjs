import test from "node:test";
import assert from "node:assert/strict";
import { evaluateJobRisk, shouldTriggerWebSearch } from "../src/scoring.mjs";
import { analyzeSearchSnippets } from "../src/websearch.mjs";
import { matchResumeToJob } from "../src/matcher.mjs";

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
  assert.ok(m.matched_keywords.includes("RAG"));
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


