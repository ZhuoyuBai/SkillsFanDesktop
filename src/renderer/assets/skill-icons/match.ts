/**
 * Skill icon auto-matching based on keywords
 * Matches skill name and description against keyword lists to find the best icon
 */

import { DEFAULT_SKILL_ICON } from './index'

const ICON_KEYWORDS: Record<string, string[]> = {
  reimbursement: ['报销', '费用', 'expense', 'reimbursement', 'reimburse', 'cost', 'payment'],
  guide: ['导引', '引导', '指南', 'guide', 'tutorial', 'onboard', 'wizard', 'walkthrough'],
  'trend-analysis': ['趋势', 'trend', 'insight', 'forecast', 'prediction'],
  share: ['分享', '共享', 'share', 'sharing', 'distribute', 'publish'],
  'document-official': ['公文', 'official', 'government', 'legal', 'decree', 'regulation'],
  points: ['积分', '消费', 'points', 'consumption', 'credits', 'spend', 'reward'],
  architecture: ['架构', '流程', 'architecture', 'workflow', 'flow', 'pipeline', 'diagram', 'process'],
  exam: ['考试', '阅读', '测试', 'exam', 'quiz', 'reading', 'assessment'],
  leave: ['请假', '假期', 'leave', 'vacation', 'holiday', 'absence', 'time-off'],
  checklist: ['列表', '清单', 'checklist', 'list', 'todo', 'task', 'backlog'],
  review: ['评审', '确认', 'review', 'confirm', 'evaluate', 'code-review', 'pr-review'],
  calendar: ['日历', '日程', '计划', 'calendar', 'schedule', 'plan', 'event', 'meeting', 'agenda'],
  approval: ['审批', '审核', 'approval', 'audit', 'approve', 'verify', 'permission'],
  lab: ['实验', '实验室', 'lab', 'experiment', 'research', 'science', 'explore', 'prototype'],
  'form-fill': ['填报', '填写', '表单', 'form', 'fill', 'submit', 'input', 'registration'],
  notification: ['通知', '公告', 'notification', 'announce', 'alert', 'broadcast', 'remind'],
  statistics: ['统计', '数据', '分析', 'statistics', 'analytics', 'data', 'dashboard', 'chart', 'metric', 'monitor'],
  'knowledge-base': ['图书', '知识库', '知识', 'library', 'knowledge', 'book', 'wiki', 'documentation', 'reference'],
  file: ['文件', '资料', 'file', 'document', 'attachment', 'upload', 'download'],
  survey: ['问卷', '投票', '调查', 'survey', 'vote', 'poll', 'feedback', 'questionnaire'],
  project: ['项目', 'project', 'initiative', 'program'],
  'message-group': ['消息', '群组', '聊天', 'message', 'chat', 'group', 'im', 'slack', 'communication', 'conversation'],
  collaboration: ['协同', '政策', 'collaboration', 'policy', 'cooperation', 'teamwork', 'coordinate'],
  news: ['新闻', '资讯', 'news', 'article', 'press', 'blog', 'post', 'media'],
  requirement: ['需求', 'requirement', 'demand', 'feature', 'spec', 'specification', 'story'],
  business: ['业务', 'business', 'coordination', 'operation', 'enterprise', 'commercial'],
  dining: ['用餐', '就餐', '餐饮', 'dining', 'meal', 'food', 'lunch', 'catering', 'restaurant'],
  email: ['邮件', '邮箱', 'email', 'mail', 'inbox', 'smtp', 'newsletter'],
  report: ['月报', '日报', '周报', '报告', 'report', 'summary', 'weekly', 'daily', 'monthly'],
  'cloud-storage': ['云盘', '云文件', 'cloud', 'storage', 'drive', 'backup', 'sync', 'oss', 's3'],
  certificate: ['证书', '资质', 'certificate', 'credential', 'qualification', 'license', 'diploma'],
  livestream: ['直播', 'live', 'stream', 'broadcast', 'webinar', 'video', 'recording'],
  expert: ['专家', '人才', 'expert', 'talent', 'people', 'team', 'hr', 'recruit', 'staff'],
  assets: ['资产', '财产', 'asset', 'property', 'inventory', 'equipment', 'device'],
}

/**
 * Match a skill to the best icon based on name and description keywords.
 * Name matches are weighted 3x higher than description matches.
 * Returns DEFAULT_SKILL_ICON ('project') if no keywords match.
 */
export function matchSkillIcon(name: string, description: string): string {
  const nameLower = name.toLowerCase()
  const descLower = description.toLowerCase()

  let bestMatch = DEFAULT_SKILL_ICON
  let bestScore = 0

  for (const [iconName, keywords] of Object.entries(ICON_KEYWORDS)) {
    let score = 0
    for (const keyword of keywords) {
      const kw = keyword.toLowerCase()
      if (nameLower.includes(kw)) {
        score += 3
      } else if (descLower.includes(kw)) {
        score += 1
      }
    }
    if (score > bestScore) {
      bestScore = score
      bestMatch = iconName
    }
  }

  return bestMatch
}
