/**
 * Skill icon assets index
 * Maps icon names to imported PNG URLs
 */

import approval from './approval.png'
import architecture from './architecture.png'
import assets from './assets.png'
import business from './business.png'
import calendar from './calendar.png'
import certificate from './certificate.png'
import checklist from './checklist.png'
import checklistAlt from './checklist-alt.png'
import cloudStorage from './cloud-storage.png'
import cloudStorageAlt from './cloud-storage-alt.png'
import collaboration from './collaboration.png'
import dining from './dining.png'
import documentOfficial from './document-official.png'
import email from './email.png'
import exam from './exam.png'
import expert from './expert.png'
import file from './file.png'
import formFill from './form-fill.png'
import guide from './guide.png'
import knowledgeBase from './knowledge-base.png'
import lab from './lab.png'
import leave from './leave.png'
import livestream from './livestream.png'
import messageGroup from './message-group.png'
import news from './news.png'
import notification from './notification.png'
import points from './points.png'
import project from './project.png'
import reimbursement from './reimbursement.png'
import report from './report.png'
import requirement from './requirement.png'
import review from './review.png'
import share from './share.png'
import statistics from './statistics.png'
import survey from './survey.png'
import trendAnalysis from './trend-analysis.png'

export const SKILL_ICON_MAP: Record<string, string> = {
  approval,
  architecture,
  assets,
  business,
  calendar,
  certificate,
  checklist,
  'checklist-alt': checklistAlt,
  'cloud-storage': cloudStorage,
  'cloud-storage-alt': cloudStorageAlt,
  collaboration,
  dining,
  'document-official': documentOfficial,
  email,
  exam,
  expert,
  file,
  'form-fill': formFill,
  guide,
  'knowledge-base': knowledgeBase,
  lab,
  leave,
  livestream,
  'message-group': messageGroup,
  news,
  notification,
  points,
  project,
  reimbursement,
  report,
  requirement,
  review,
  share,
  statistics,
  survey,
  'trend-analysis': trendAnalysis,
}

export const DEFAULT_SKILL_ICON = 'project'

export function getSkillIconUrl(iconName: string): string {
  return SKILL_ICON_MAP[iconName] || SKILL_ICON_MAP[DEFAULT_SKILL_ICON]
}

export function getAllSkillIcons(): { name: string; url: string }[] {
  return Object.entries(SKILL_ICON_MAP).map(([name, url]) => ({ name, url }))
}
