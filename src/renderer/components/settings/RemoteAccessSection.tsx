/**
 * Remote Access Section
 *
 * Tab-based container for WeChat, Feishu, and Browser remote access settings.
 */

import { useState } from 'react'
import { useTranslation } from '../../i18n'
import { api } from '../../api'
import { WeChatSettings } from './WeChatSettings'
import { FeishuSettings } from './FeishuSettings'
import { RemoteLinkSettings } from './RemoteLinkSettings'

import wechatIcon from '../../assets/channels/wechat.png'
import feishuIcon from '../../assets/channels/feishu.png'
import browserIcon from '../../assets/channels/browser.png'

type RemoteTab = 'wechat' | 'feishu' | 'browser'

export function RemoteAccessSection({ config }: { config: Record<string, unknown> }) {
  const { t } = useTranslation()
  const isRemote = api.isRemoteMode()
  const [activeTab, setActiveTab] = useState<RemoteTab>(isRemote ? 'browser' : 'wechat')

  const tabs: { id: RemoteTab; icon: string; label: string }[] = [
    ...(!isRemote ? [
      { id: 'wechat' as RemoteTab, icon: wechatIcon, label: t('WeChat') },
      { id: 'feishu' as RemoteTab, icon: feishuIcon, label: t('Feishu') },
    ] : []),
    { id: 'browser' as RemoteTab, icon: browserIcon, label: t('Browser') },
  ]

  // Only one tab in remote mode - skip tab navigation
  if (tabs.length === 1) {
    return <RemoteLinkSettings />
  }

  return (
    <div>
      {/* Tab Navigation */}
      <div className="flex items-center gap-1 p-1 bg-secondary/50 rounded-lg">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm transition-all ${
              activeTab === tab.id
                ? 'bg-background text-foreground shadow-sm font-medium'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <img src={tab.icon} alt={tab.label} className="w-5 h-5" />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        {activeTab === 'wechat' && <WeChatSettings config={config} />}
        {activeTab === 'feishu' && <FeishuSettings config={config} />}
        {activeTab === 'browser' && <RemoteLinkSettings />}
      </div>
    </div>
  )
}
