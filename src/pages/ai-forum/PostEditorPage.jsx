import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye } from 'lucide-react'
import { useAuth } from '../../components/ai-forum/AuthProvider.jsx'
import { createPost, getBoards } from '../../utils/ai-forum/apiClient.js'
import { tags } from '../../utils/ai-forum/mockData.js'
import AIDraftPanel from '../../components/ai-forum/ai/AIDraftPanel.jsx'

const MAX_TITLE_LENGTH = 100
const MIN_TITLE_LENGTH = 5
const MIN_CONTENT_LENGTH = 20
const MAX_TAG_COUNT = 5

export default function PostEditorPage() {
  const { isAuthenticated, user } = useAuth()
  const navigate = useNavigate()

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [selectedBoardId, setSelectedBoardId] = useState('')
  const [selectedTags, setSelectedTags] = useState(new Set())
  const [showPreview, setShowPreview] = useState(false)
  // 版块列表从 API 异步加载
  const [boards, setBoards] = useState([])
  // 发布中状态：防止重复提交
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState(null)

  // 路由守卫：未登录立即重定向到登录页（带 from=editor 参数）
  // 使用 replace:true 是为了替换浏览器历史栈，防止用户按后退又回到编辑器页面被重复拦截
  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/forum/login?from=editor', { replace: true })
    }
  }, [isAuthenticated, navigate])

  // 版块列表加载：cancelled 标志防止组件卸载后仍更新状态
  useEffect(() => {
    let cancelled = false
    getBoards().then((data) => {
      if (cancelled) return
      if (Array.isArray(data) && data.length > 0) {
        setBoards(data)
      }
    })
    return () => { cancelled = true }
  }, [])

  // 若未登录则不渲染任何内容，等待 useEffect 完成重定向，避免页面闪烁
  if (!isAuthenticated) return null

  const toggleTag = (tag) => {
    setSelectedTags((prev) => {
      const next = new Set(prev)
      if (next.has(tag)) {
        next.delete(tag)
      } else {
        // 最多 5 个标签，防止垃圾帖堆标签
        if (next.size >= MAX_TAG_COUNT) return prev
        next.add(tag)
      }
      return next
    })
  }

  // AI 推荐标签「点击添加」：只增不减，同样受 MAX_TAG_COUNT 约束
  const handleAiTagAdd = (tag) => {
    if (!tag) return
    setSelectedTags((prev) => {
      if (prev.has(tag)) return prev
      if (prev.size >= MAX_TAG_COUNT) return prev
      const next = new Set(prev)
      next.add(tag)
      return next
    })
  }

  const handlePreview = () => {
    setShowPreview(true)
  }

  const handleSaveDraft = () => {
    alert('草稿已本地保存（Mock）')
  }

  // canPublish 增加 !publishing 条件：发布中禁用按钮防止重复提交
  const canPublish =
    title.trim().length >= MIN_TITLE_LENGTH &&
    content.trim().length >= MIN_CONTENT_LENGTH &&
    selectedBoardId !== '' &&
    !publishing

  const handlePublish = async () => {
    // 兜底校验：即使按钮 disabled 被绕过也不允许发布垃圾帖
    const missing = []
    if (title.trim().length < MIN_TITLE_LENGTH) missing.push(`标题至少 ${MIN_TITLE_LENGTH} 字`)
    if (content.trim().length < MIN_CONTENT_LENGTH) missing.push(`正文至少 ${MIN_CONTENT_LENGTH} 字`)
    if (selectedBoardId === '') missing.push('请选择版块')
    if (missing.length > 0) {
      alert(missing.join('；'))
      return
    }

    const trimmedContent = content.trim()
    // authorId：优先从 AuthProvider 获取当前用户，兜底 'u_alex'（开发环境）
    const authorId = user?.id || 'u_alex'

    setPublishing(true)
    setPublishError(null)

    try {
      const newPost = await createPost({
        title: title.trim(),
        content: `<p>${trimmedContent.split('\n').join('</p><p>')}</p>`,
        boardId: selectedBoardId,
        tags: Array.from(selectedTags),
        summary: trimmedContent.slice(0, 120) + '...',
        authorId,
      })

      // createPost 内部已捕获网络/HTTP 错误并返回 null
      if (!newPost) {
        setPublishError('发布失败，请重试')
        setPublishing(false)
        return
      }

      // 发布成功：跳转到新帖详情页
      navigate(`/forum/post/${newPost.id}`)
    } catch (err) {
      // 兜底：未预期的异常
      setPublishError('发布失败，请重试')
      setPublishing(false)
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="flex flex-col md:flex-row gap-6">
        {/* 左栏：编辑器主体 */}
        <div className="flex-1 md:w-2/3 space-y-6">
          {/* 标题输入 */}
          <div className="relative">
            <input
              type="text"
              maxLength={MAX_TITLE_LENGTH}
              className="w-full text-3xl font-bold placeholder:text-afmuted-foreground/60 border-b border-border pb-4 mb-2 bg-transparent outline-none focus:border-vermilion transition-colors"
              placeholder="请输入帖子标题"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <div className="text-right text-xs text-afmuted-foreground">
              当前 {title.length}/{MAX_TITLE_LENGTH}
            </div>
          </div>

          {/* 正文编辑 */}
          <div>
            <textarea
              className="w-full min-h-[420px] p-4 rounded-af-md border border-border resize-y leading-relaxed bg-card text-foreground placeholder:text-afmuted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="写下你的思考、提问或经验分享...支持换行分段"
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
            <div className="text-right text-xs text-afmuted-foreground mt-1">
              {content.length} 字
              {content.length > 0 && content.length < MIN_CONTENT_LENGTH ? (
                <span className="ml-2 text-warning">（至少 {MIN_CONTENT_LENGTH} 字可发布）</span>
              ) : null}
            </div>
          </div>

          {/* 版块选择区 */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">选择版块</label>
            <select
              value={selectedBoardId}
              onChange={(e) => setSelectedBoardId(e.target.value)}
              className="w-full px-3 py-2 rounded-af-md border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
            >
              <option value="">请选择发布版块</option>
              {boards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} · {(b.description || '').slice(0, 20)}...
                </option>
              ))}
            </select>
          </div>

          {/* 标签选择 chips */}
          <div>
            <p className="block text-sm font-medium text-foreground mb-2">
              添加标签（最多 {MAX_TAG_COUNT} 个）
            </p>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => {
                const isSelected = selectedTags.has(tag)
                const isDisabled = !isSelected && selectedTags.size >= MAX_TAG_COUNT
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    disabled={isDisabled}
                    className={`px-3 py-1.5 rounded-full border text-sm transition-colors ${
                      isSelected
                        ? 'bg-vermilion text-cream border-vermilion'
                        : isDisabled
                        ? 'bg-afmuted/50 text-afmuted-foreground border-border cursor-not-allowed opacity-60'
                        : 'bg-card text-foreground border-border hover:border-vermilion/60 hover:text-vermilion'
                    }`}
                  >
                    {tag}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* 右栏：AI 助手面板 */}
        <aside className="w-full md:w-1/3 md:pl-6">
          <div className="md:sticky md:top-6">
            <AIDraftPanel
              content={content}
              boardId={selectedBoardId}
              currentTags={Array.from(selectedTags)}
              onTitleSelect={(t) => setTitle(t)}
              onTagAdd={handleAiTagAdd}
              onContentReplace={(c) => setContent(c)}
            />
          </div>
        </aside>
      </div>

      {/* 发布错误提示：发布失败时在操作栏上方显示 */}
      {publishError ? (
        <div className="sticky bottom-[68px] z-10 mt-4 rounded-af-md border border-error/30 bg-error/5 px-4 py-2.5 text-sm text-error">
          {publishError}
        </div>
      ) : null}

      {/* 底部操作栏：sticky 吸底，bg-cream 与全局背景一致，z-10 防止被侧栏遮挡 */}
      <div className="sticky bottom-0 bg-cream py-4 border-t border-border mt-8 flex gap-3 justify-end z-10 max-[600px]:px-2">
        <button
          type="button"
          onClick={handlePreview}
          className="h-10 px-4 rounded-af-md border border-border bg-card text-foreground text-sm font-medium hover:bg-afmuted transition-colors inline-flex items-center gap-1.5"
        >
          <Eye className="size-4" /> 预览
        </button>
        <button
          type="button"
          onClick={handleSaveDraft}
          className="h-10 px-4 rounded-af-md border border-border bg-card text-foreground text-sm font-medium hover:bg-afmuted transition-colors"
        >
          保存草稿
        </button>
        <button
          type="button"
          onClick={handlePublish}
          disabled={!canPublish}
          className={`h-10 px-6 rounded-af-md text-sm font-medium transition-colors ${
            canPublish
              ? 'bg-vermilion text-cream hover:bg-vermilion-light'
              : 'bg-afmuted/50 text-afmuted-foreground pointer-events-none cursor-not-allowed'
          }`}
        >
          {publishing ? '发布中...' : '发布'}
        </button>
      </div>

      {/* 预览模态（Phase2 占位实现） */}
      {showPreview ? (
        <div
          className="fixed inset-0 bg-ink/50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowPreview(false)}
        >
          <div
            className="bg-card border border-border rounded-af-xl max-w-2xl w-full max-h-[80vh] overflow-auto p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">草稿预览</h3>
              <button
                type="button"
                onClick={() => setShowPreview(false)}
                className="text-afmuted-foreground hover:text-foreground"
              >
                关闭
              </button>
            </div>
            <div>
              <h4 className="text-2xl font-bold text-foreground mb-3">
                {title.length > 0 ? title : <span className="text-afmuted-foreground">（未填写标题）</span>}
              </h4>
              <div className="text-sm text-afmuted-foreground mb-4">
                {selectedBoardId !== ''
                  ? boards.find((b) => b.id === selectedBoardId)?.name
                  : '（未选择版块）'}
                {selectedTags.size > 0 ? (
                  <span className="ml-3">
                    标签：{Array.from(selectedTags).join('、')}
                  </span>
                ) : null}
              </div>
              <div className="whitespace-pre-wrap text-foreground leading-relaxed border-t border-border pt-4">
                {content.length > 0 ? content : <span className="text-afmuted-foreground">（未填写正文）</span>}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
