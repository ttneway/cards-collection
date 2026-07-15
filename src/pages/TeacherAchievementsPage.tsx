import { useEffect, useMemo, useState } from 'react'
import {
  BookOpen,
  ClipboardList,
  Info,
  ImagePlus,
  Pencil,
  Plus,
  Power,
  PowerOff,
  RefreshCw,
  Save,
  Sparkles,
  Trophy,
  Upload,
  Wand2,
  X,
} from 'lucide-react'
import { DEFAULT_HUGGING_FACE_AUTHOR, DEFAULT_HUGGING_FACE_MODEL_NAME, buildHuggingFaceModelPath, invokeAiImageFunction } from '../lib/aiImage'
import {
  ACHIEVEMENT_CATEGORY_LABELS,
  ACHIEVEMENT_CONDITION_LABELS,
  ACHIEVEMENT_PROGRESS_MODE_LABELS,
} from '../lib/achievements'
import { STYLE_OPTIONS } from '../lib/character'
import { uploadImageFile } from '../lib/imageUpload'
import { supabase } from '../lib/supabase'
import type {
  Achievement,
  AchievementAuthoringMode,
  AchievementCategory,
  AchievementCondition,
  AchievementConditionType,
  Card,
  CardAlbum,
  Rarity,
  Task,
} from '../types'

type TemplateKey =
  | 'tasks_completed_total'
  | 'cards_collected_total'
  | 'points_earned_total'
  | 'task_streak_daily'
  | 'task_streak_weekly'
  | 'task_streak_selected'
  | 'series_complete'
  | 'album_complete'
  | 'selected_tasks_all_complete'

type ConditionDraft = {
  id: string
  condition_type: AchievementConditionType
  target_value: number
  recurrence_type: 'daily' | 'weekly'
  selected_task_ids: string[]
  series: string
  album_id: string
  rarity: '' | Rarity
}

type AchievementForm = {
  name: string
  description: string
  image_url: string
  image_prompt: string
  image_style: string
  category: AchievementCategory
  progress_mode: Achievement['progress_mode']
  authoring_mode: AchievementAuthoringMode
  template_key: TemplateKey
  points_reward: number
  card_reward: string
  is_active: boolean
  sort_order: number
  is_preset: boolean
  simple_target_value: number
  simple_recurrence_type: 'daily' | 'weekly'
  simple_selected_task_ids: string[]
  simple_series: string
  simple_album_id: string
  conditions: ConditionDraft[]
}

const TEMPLATE_OPTIONS: Array<{
  key: TemplateKey
  label: string
  description: string
  category: AchievementCategory
  progress_mode: Achievement['progress_mode']
}> = [
  { key: 'tasks_completed_total', label: '累積任務次數', description: '適合設定完成 10 次、50 次任務這類里程碑。', category: 'task', progress_mode: 'cumulative' },
  { key: 'cards_collected_total', label: '累積收集卡牌數', description: '用來鼓勵學生逐步擴充牌庫。', category: 'card', progress_mode: 'cumulative' },
  { key: 'points_earned_total', label: '累積獲得星星', description: '看歷史總共賺過多少星星，不會因花掉而倒退。', category: 'points', progress_mode: 'cumulative' },
  { key: 'task_streak_daily', label: '連續每日任務', description: '例如連續 3 天、7 天都有完成每日任務。', category: 'task', progress_mode: 'streak' },
  { key: 'task_streak_weekly', label: '連續每週任務', description: '例如連續 4 週都有完成每週任務。', category: 'task', progress_mode: 'streak' },
  { key: 'task_streak_selected', label: '連續指定任務', description: '適合指定某些任務必須持續完成。', category: 'task', progress_mode: 'streak' },
  { key: 'series_complete', label: '收齊某系列', description: '一整個系列都收滿才算達成。', category: 'card', progress_mode: 'all_complete' },
  { key: 'album_complete', label: '收齊某卡冊', description: '一整本卡冊全部收滿。', category: 'card', progress_mode: 'all_complete' },
  { key: 'selected_tasks_all_complete', label: '指定任務全部完成', description: '老師手動指定一組任務，全部完成才解鎖。', category: 'task', progress_mode: 'all_complete' },
]

const FILTER_OPTIONS = [
  { key: 'all', label: '全部' },
  { key: 'active', label: '啟用中' },
  { key: 'inactive', label: '未啟用' },
  { key: 'preset', label: '預設草稿' },
] as const

const ADVANCED_CONDITION_OPTIONS: Array<{ value: AchievementConditionType; label: string }> = [
  { value: 'tasks_completed_total', label: '累積完成任務' },
  { value: 'tasks_completed_selected', label: '指定任務累積次數' },
  { value: 'task_streak_any', label: '連續完成每日 / 每週任務' },
  { value: 'task_streak_selected', label: '指定任務連續完成' },
  { value: 'cards_collected_total', label: '累積收集卡牌' },
  { value: 'series_complete', label: '收齊系列' },
  { value: 'album_complete', label: '收齊卡冊' },
  { value: 'points_earned_total', label: '歷史累積星星' },
  { value: 'selected_tasks_all_complete', label: '指定任務全部完成' },
  { value: 'rarity_collection', label: '指定稀有度收集' },
]

function createConditionDraft(overrides?: Partial<ConditionDraft>): ConditionDraft {
  return {
    id: crypto.randomUUID(),
    condition_type: 'tasks_completed_total',
    target_value: 1,
    recurrence_type: 'daily',
    selected_task_ids: [],
    series: '',
    album_id: '',
    rarity: '',
    ...overrides,
  }
}

const emptyForm: AchievementForm = {
  name: '',
  description: '',
  image_url: '',
  image_prompt: '',
  image_style: STYLE_OPTIONS[0],
  category: 'task',
  progress_mode: 'cumulative',
  authoring_mode: 'simple',
  template_key: 'tasks_completed_total',
  points_reward: 0,
  card_reward: '',
  is_active: true,
  sort_order: 0,
  is_preset: false,
  simple_target_value: 1,
  simple_recurrence_type: 'daily',
  simple_selected_task_ids: [],
  simple_series: '',
  simple_album_id: '',
  conditions: [createConditionDraft()],
}

function getTemplateMeta(templateKey: TemplateKey) {
  return TEMPLATE_OPTIONS.find(option => option.key === templateKey) ?? TEMPLATE_OPTIONS[0]
}

function buildSimpleCondition(form: AchievementForm): ConditionDraft {
  switch (form.template_key) {
    case 'tasks_completed_total':
      return createConditionDraft({
        condition_type: 'tasks_completed_total',
        target_value: form.simple_target_value,
      })
    case 'cards_collected_total':
      return createConditionDraft({
        condition_type: 'cards_collected_total',
        target_value: form.simple_target_value,
      })
    case 'points_earned_total':
      return createConditionDraft({
        condition_type: 'points_earned_total',
        target_value: form.simple_target_value,
      })
    case 'task_streak_daily':
      return createConditionDraft({
        condition_type: 'task_streak_any',
        target_value: form.simple_target_value,
        recurrence_type: 'daily',
      })
    case 'task_streak_weekly':
      return createConditionDraft({
        condition_type: 'task_streak_any',
        target_value: form.simple_target_value,
        recurrence_type: 'weekly',
      })
    case 'task_streak_selected':
      return createConditionDraft({
        condition_type: 'task_streak_selected',
        target_value: form.simple_target_value,
        recurrence_type: form.simple_recurrence_type,
        selected_task_ids: form.simple_selected_task_ids,
      })
    case 'series_complete':
      return createConditionDraft({
        condition_type: 'series_complete',
        target_value: 1,
        series: form.simple_series,
      })
    case 'album_complete':
      return createConditionDraft({
        condition_type: 'album_complete',
        target_value: 1,
        album_id: form.simple_album_id,
      })
    case 'selected_tasks_all_complete':
      return createConditionDraft({
        condition_type: 'selected_tasks_all_complete',
        target_value: Math.max(form.simple_selected_task_ids.length, 1),
        selected_task_ids: form.simple_selected_task_ids,
      })
    default:
      return createConditionDraft()
  }
}

function inferTemplateKey(condition: AchievementCondition): TemplateKey {
  switch (condition.condition_type) {
    case 'tasks_completed_total':
      return 'tasks_completed_total'
    case 'cards_collected_total':
      return 'cards_collected_total'
    case 'points_earned_total':
      return 'points_earned_total'
    case 'task_streak_any':
      return condition.config_json?.recurrence_type === 'weekly' ? 'task_streak_weekly' : 'task_streak_daily'
    case 'task_streak_selected':
      return 'task_streak_selected'
    case 'series_complete':
      return 'series_complete'
    case 'album_complete':
      return 'album_complete'
    case 'selected_tasks_all_complete':
      return 'selected_tasks_all_complete'
    default:
      return 'tasks_completed_total'
  }
}

function mapConditionToDraft(condition: AchievementCondition): ConditionDraft {
  return createConditionDraft({
    id: condition.id,
    condition_type: condition.condition_type,
    target_value: condition.target_value,
    recurrence_type: condition.config_json?.recurrence_type === 'weekly' ? 'weekly' : 'daily',
    selected_task_ids: (condition.achievement_condition_tasks ?? []).map(item => item.task_id),
    series: typeof condition.config_json?.series === 'string' ? condition.config_json.series : '',
    album_id: typeof condition.config_json?.album_id === 'string' ? condition.config_json.album_id : '',
    rarity: typeof condition.config_json?.rarity === 'string' ? (condition.config_json.rarity as Rarity) : '',
  })
}

function mapAchievementToForm(achievement: Achievement): AchievementForm {
  const firstCondition = achievement.achievement_conditions?.[0]
  const templateKey = firstCondition ? inferTemplateKey(firstCondition) : 'tasks_completed_total'
  const templateMeta = getTemplateMeta(templateKey)

  return {
    name: achievement.name,
    description: achievement.description ?? '',
    image_url: achievement.image_url ?? achievement.icon_url ?? '',
    image_prompt: achievement.image_prompt ?? '',
    image_style: achievement.image_style ?? STYLE_OPTIONS[0],
    category: templateMeta.category ?? achievement.category,
    progress_mode: templateMeta.progress_mode ?? achievement.progress_mode,
    authoring_mode: achievement.authoring_mode,
    template_key: templateKey,
    points_reward: achievement.points_reward,
    card_reward: achievement.card_reward ?? '',
    is_active: achievement.is_active,
    sort_order: achievement.sort_order,
    is_preset: achievement.is_preset,
    simple_target_value: firstCondition?.target_value ?? 1,
    simple_recurrence_type: firstCondition?.config_json?.recurrence_type === 'weekly' ? 'weekly' : 'daily',
    simple_selected_task_ids: firstCondition?.achievement_condition_tasks?.map(item => item.task_id) ?? [],
    simple_series: typeof firstCondition?.config_json?.series === 'string' ? firstCondition.config_json.series : '',
    simple_album_id: typeof firstCondition?.config_json?.album_id === 'string' ? firstCondition.config_json.album_id : '',
    conditions: (achievement.achievement_conditions ?? []).map(mapConditionToDraft),
  }
}

function buildConditionConfig(condition: ConditionDraft) {
  switch (condition.condition_type) {
    case 'task_streak_any':
    case 'task_streak_selected':
      return { recurrence_type: condition.recurrence_type }
    case 'series_complete':
      return { series: condition.series.trim() }
    case 'album_complete':
      return { album_id: condition.album_id || '' }
    case 'rarity_collection':
      return { rarity: condition.rarity || '' }
    default:
      return {}
  }
}

function conditionSummary(
  condition: AchievementCondition | ConditionDraft,
  options: {
    albumMap: Map<string, CardAlbum>
  }
) {
  const recurrenceType = 'config_json' in condition
    ? condition.config_json?.recurrence_type === 'weekly'
      ? 'weekly'
      : 'daily'
    : condition.recurrence_type
  const selectedTaskIds =
    'selected_task_ids' in condition
      ? condition.selected_task_ids
      : (condition.achievement_condition_tasks ?? []).map(item => item.task_id)

  switch (condition.condition_type) {
    case 'tasks_completed_total':
      return `累積完成 ${condition.target_value} 次任務`
    case 'tasks_completed_selected':
      return `指定任務累積完成 ${condition.target_value} 次`
    case 'task_streak_any':
      return `連續 ${condition.target_value} ${recurrenceType === 'weekly' ? '週' : '天'}完成任務`
    case 'task_streak_selected':
      return `指定任務連續 ${condition.target_value} ${recurrenceType === 'weekly' ? '週' : '天'}完成`
    case 'cards_collected_total':
      return `累積收集 ${condition.target_value} 張卡牌`
    case 'series_complete':
      return `收齊系列：${'config_json' in condition ? condition.config_json?.series || '未指定' : condition.series || '未指定'}`
    case 'album_complete': {
      const albumId = 'config_json' in condition ? condition.config_json?.album_id : condition.album_id
      return `收齊卡冊：${options.albumMap.get(albumId ?? '')?.name ?? '未指定'}`
    }
    case 'points_earned_total':
      return `歷史累積獲得 ${condition.target_value} 星星`
    case 'selected_tasks_all_complete':
      return `指定任務全部完成（${selectedTaskIds.length} 個任務）`
    case 'rarity_collection':
      return `收集指定稀有度 ${'config_json' in condition ? condition.config_json?.rarity || '未指定' : condition.rarity || '未指定'} ${condition.target_value} 張`
    default:
      return ACHIEVEMENT_CONDITION_LABELS[condition.condition_type] ?? condition.condition_type
  }
}

function renderTaskSelector(
  selectedTaskIds: string[],
  tasks: Task[],
  onToggle: (taskId: string) => void,
  helperText: string
) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-400">{helperText}</p>
      <div className="max-h-52 space-y-2 overflow-y-auto rounded-xl border border-slate-700 bg-slate-950/60 p-3">
        {tasks.length === 0 ? (
          <p className="text-sm text-slate-500">目前還沒有可選的任務。</p>
        ) : (
          tasks.map(task => (
            <label key={task.id} className="flex items-start gap-2 rounded-lg px-2 py-1 text-sm text-slate-200 hover:bg-slate-800/80">
              <input
                type="checkbox"
                checked={selectedTaskIds.includes(task.id)}
                onChange={() => onToggle(task.id)}
                className="mt-1 accent-indigo-500"
              />
              <span>
                <span className="block text-white">{task.title}</span>
                <span className="text-xs text-slate-500">
                  {task.recurrence_type === 'daily' ? '每日' : task.recurrence_type === 'weekly' ? '每週' : '其他'} · {task.points} 點
                </span>
              </span>
            </label>
          ))
        )}
      </div>
    </div>
  )
}

export default function TeacherAchievementsPage() {
  const [achievements, setAchievements] = useState<Achievement[]>([])
  const [cards, setCards] = useState<Card[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [albums, setAlbums] = useState<CardAlbum[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<AchievementForm>(emptyForm)
  const [filter, setFilter] = useState<(typeof FILTER_OPTIONS)[number]['key']>('all')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [generatingImage, setGeneratingImage] = useState(false)
  const [teacherApiKey, setTeacherApiKey] = useState('')
  const [aiProvider, setAiProvider] = useState<'gemini' | 'openai' | 'huggingface'>('gemini')
  const [huggingFaceAuthor, setHuggingFaceAuthor] = useState(DEFAULT_HUGGING_FACE_AUTHOR)
  const [huggingFaceModelName, setHuggingFaceModelName] = useState(DEFAULT_HUGGING_FACE_MODEL_NAME)

  const albumMap = useMemo(() => new Map(albums.map(album => [album.id, album])), [albums])
  const huggingFaceModel = buildHuggingFaceModelPath(huggingFaceAuthor, huggingFaceModelName)

  const filteredAchievements = useMemo(() => {
    if (filter === 'all') return achievements
    if (filter === 'active') return achievements.filter(item => item.is_active)
    if (filter === 'inactive') return achievements.filter(item => !item.is_active)
    return achievements.filter(item => item.is_preset)
  }, [achievements, filter])

  useEffect(() => {
    void Promise.all([loadAchievements(), loadCards(), loadTasks(), loadAlbums()])
  }, [])

  const loadAchievements = async () => {
    const { data, error: loadError } = await supabase
      .from('achievements')
      .select('*, achievement_conditions(*, achievement_condition_tasks(task_id))')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (loadError) {
      setError(loadError.message)
      return
    }

    setAchievements((data ?? []) as Achievement[])
  }

  const loadCards = async () => {
    const { data } = await supabase.from('cards').select('*').order('name')
    setCards((data ?? []) as Card[])
  }

  const loadTasks = async () => {
    const { data } = await supabase
      .from('tasks')
      .select('*')
      .eq('is_active', true)
      .order('title')
    setTasks((data ?? []) as Task[])
  }

  const loadAlbums = async () => {
    const { data } = await supabase.from('card_albums').select('*').order('name')
    setAlbums((data ?? []) as CardAlbum[])
  }

  const resetForm = () => {
    setEditingId(null)
    setForm(emptyForm)
    setMessage(null)
    setError(null)
  }

  const beginEdit = (achievement: Achievement) => {
    setEditingId(achievement.id)
    setForm(mapAchievementToForm(achievement))
    setMessage(`正在編輯成就「${achievement.name}」`)
    setError(null)
  }

  const toggleSimpleTask = (taskId: string) => {
    setForm(previous => ({
      ...previous,
      simple_selected_task_ids: previous.simple_selected_task_ids.includes(taskId)
        ? previous.simple_selected_task_ids.filter(id => id !== taskId)
        : [...previous.simple_selected_task_ids, taskId],
    }))
  }

  const toggleAdvancedTask = (conditionId: string, taskId: string) => {
    setForm(previous => ({
      ...previous,
      conditions: previous.conditions.map(condition =>
        condition.id !== conditionId
          ? condition
          : {
              ...condition,
              selected_task_ids: condition.selected_task_ids.includes(taskId)
                ? condition.selected_task_ids.filter(id => id !== taskId)
                : [...condition.selected_task_ids, taskId],
            }
      ),
    }))
  }

  const updateCondition = <K extends keyof ConditionDraft>(conditionId: string, key: K, value: ConditionDraft[K]) => {
    setForm(previous => ({
      ...previous,
      conditions: previous.conditions.map(condition => (condition.id === conditionId ? { ...condition, [key]: value } : condition)),
    }))
  }

  const addCondition = () => {
    setForm(previous => ({ ...previous, conditions: [...previous.conditions, createConditionDraft()] }))
  }

  const removeCondition = (conditionId: string) => {
    setForm(previous => ({
      ...previous,
      conditions: previous.conditions.length <= 1
        ? previous.conditions
        : previous.conditions.filter(condition => condition.id !== conditionId),
    }))
  }

  const handleTemplateChange = (templateKey: TemplateKey) => {
    const meta = getTemplateMeta(templateKey)
    setForm(previous => ({
      ...previous,
      template_key: templateKey,
      category: meta.category,
      progress_mode: meta.progress_mode,
      simple_target_value:
        templateKey === 'series_complete' || templateKey === 'album_complete' || templateKey === 'selected_tasks_all_complete'
          ? previous.simple_target_value
          : Math.max(previous.simple_target_value, 1),
    }))
  }

  const buildConditionDraftsForSave = () => {
    const sourceConditions = form.authoring_mode === 'simple' ? [buildSimpleCondition(form)] : form.conditions

    return sourceConditions.map((condition, index) => ({
      condition_type: condition.condition_type,
      target_value:
        condition.condition_type === 'selected_tasks_all_complete'
          ? Math.max(condition.selected_task_ids.length, 1)
          : Math.max(condition.target_value, 1),
      sort_order: index,
      config_json: buildConditionConfig(condition),
      selected_task_ids: condition.selected_task_ids,
    }))
  }

  const saveAchievement = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setMessage(null)
    setError(null)

    try {
      const templateMeta = getTemplateMeta(form.template_key)
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        image_url: form.image_url.trim() || null,
        icon_url: form.image_url.trim() || null,
        image_prompt: form.image_prompt.trim() || null,
        image_style: form.image_style.trim() || null,
        category: form.authoring_mode === 'simple' ? templateMeta.category : form.category,
        progress_mode: form.authoring_mode === 'simple' ? templateMeta.progress_mode : form.progress_mode,
        authoring_mode: form.authoring_mode,
        claim_mode: 'manual',
        points_reward: Math.max(Number(form.points_reward), 0),
        card_reward: form.card_reward || null,
        is_active: form.is_active,
        sort_order: Number(form.sort_order) || 0,
        is_preset: form.is_preset,
      }

      let achievementId = editingId

      if (!achievementId) {
        const { data, error: insertError } = await supabase.from('achievements').insert(payload).select('*').single()
        if (insertError) throw insertError
        achievementId = data.id
      } else {
        const { error: updateError } = await supabase.from('achievements').update(payload).eq('id', achievementId)
        if (updateError) throw updateError

        const { error: deleteConditionError } = await supabase.from('achievement_conditions').delete().eq('achievement_id', achievementId)
        if (deleteConditionError) throw deleteConditionError
      }

      const conditionDrafts = buildConditionDraftsForSave()

      for (const condition of conditionDrafts) {
        const { data: conditionRow, error: conditionError } = await supabase
          .from('achievement_conditions')
          .insert({
            achievement_id: achievementId,
            condition_type: condition.condition_type,
            target_value: condition.target_value,
            sort_order: condition.sort_order,
            config_json: condition.config_json,
          })
          .select('id')
          .single()

        if (conditionError) throw conditionError

        if (condition.selected_task_ids.length > 0) {
          const rows = condition.selected_task_ids.map(taskId => ({
            condition_id: conditionRow.id,
            task_id: taskId,
          }))
          const { error: taskLinkError } = await supabase.from('achievement_condition_tasks').insert(rows)
          if (taskLinkError) throw taskLinkError
        }
      }

      setMessage(editingId ? `已更新成就「${payload.name}」` : `已新增成就「${payload.name}」`)
      resetForm()
      await loadAchievements()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '儲存成就時發生錯誤。')
    } finally {
      setSaving(false)
    }
  }

  const ensureAchievementForImage = async () => {
    const templateMeta = getTemplateMeta(form.template_key)
    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      image_url: form.image_url.trim() || null,
      icon_url: form.image_url.trim() || null,
      image_prompt: form.image_prompt.trim() || null,
      image_style: form.image_style.trim() || null,
      category: form.authoring_mode === 'simple' ? templateMeta.category : form.category,
      progress_mode: form.authoring_mode === 'simple' ? templateMeta.progress_mode : form.progress_mode,
      authoring_mode: form.authoring_mode,
      claim_mode: 'manual',
      points_reward: Math.max(Number(form.points_reward), 0),
      card_reward: form.card_reward || null,
      is_active: form.is_active,
      sort_order: Number(form.sort_order) || 0,
      is_preset: form.is_preset,
    }

    if (!payload.name) {
      throw new Error('Please enter an achievement name before generating an image.')
    }

    if (!editingId) {
      const { data, error: insertError } = await supabase.from('achievements').insert(payload).select('*').single()
      if (insertError) throw insertError
      const achievement = data as Achievement
      setEditingId(achievement.id)
      return achievement
    }

    const { data, error: updateError } = await supabase
      .from('achievements')
      .update(payload)
      .eq('id', editingId)
      .select('*')
      .single()

    if (updateError) throw updateError
    return data as Achievement
  }

  const handleAchievementImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setUploadingImage(true)
    setMessage(null)
    setError(null)

    try {
      const result = await uploadImageFile(file, 'achievements')
      setForm(previous => ({ ...previous, image_url: result.publicUrl }))
      setMessage('Achievement image uploaded.')
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Achievement image upload failed.')
    } finally {
      setUploadingImage(false)
    }
  }

  const generateAchievementImage = async () => {
    setGeneratingImage(true)
    setMessage(null)
    setError(null)

    try {
      const achievement = await ensureAchievementForImage()
      const result = await invokeAiImageFunction({
        action: 'generate',
        targetType: 'achievement',
        targetId: achievement.id,
        imagePrompt: form.image_prompt.trim(),
        imageStyle: form.image_style,
        aiProvider,
        apiKey: teacherApiKey.trim() || undefined,
        modelOverride: aiProvider === 'huggingface' ? huggingFaceModel : undefined,
      })

      const data = result.data as Record<string, any> | null
      if (!result.ok || data?.error) {
        throw new Error((data?.error as string | undefined) ?? `Edge Function returned HTTP ${result.status}`)
      }

      if (typeof data?.image_url === 'string') {
        setForm(previous => ({ ...previous, image_url: data.image_url as string }))
      }

      await loadAchievements()
      setMessage((data?.message as string | undefined) ?? 'Achievement image generated.')
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : 'Achievement image generation failed.')
    } finally {
      setGeneratingImage(false)
    }
  }

  const toggleActive = async (achievement: Achievement) => {
    setMessage(null)
    setError(null)

    const { error: updateError } = await supabase
      .from('achievements')
      .update({ is_active: !achievement.is_active })
      .eq('id', achievement.id)

    if (updateError) {
      setError(updateError.message)
      return
    }

    setMessage(achievement.is_active ? `已停用「${achievement.name}」` : `已啟用「${achievement.name}」`)
    await loadAchievements()
  }

  const simpleConditionPreview = buildSimpleCondition(form)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">成就管理</h1>
        <p className="mt-1 text-sm text-slate-400">建立累積、連續、全部完成這三種成就，學生達成後會到成就頁手動領取獎勵。</p>
      </div>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-700 bg-slate-800/70 p-4">
          <div className="flex items-center gap-2 text-white"><Sparkles size={16} className="text-indigo-300" />累積</div>
          <p className="mt-2 text-sm text-slate-400">慢慢累加就會達成，例如完成 25 次任務、收集 30 張卡牌。</p>
        </div>
        <div className="rounded-2xl border border-slate-700 bg-slate-800/70 p-4">
          <div className="flex items-center gap-2 text-white"><Trophy size={16} className="text-amber-300" />連續</div>
          <p className="mt-2 text-sm text-slate-400">中斷就會重新計算，例如連續 7 天完成每日任務。</p>
        </div>
        <div className="rounded-2xl border border-slate-700 bg-slate-800/70 p-4">
          <div className="flex items-center gap-2 text-white"><ClipboardList size={16} className="text-emerald-300" />全部完成</div>
          <p className="mt-2 text-sm text-slate-400">一整組都完成才會解鎖，例如收齊某系列或完成指定任務清單。</p>
        </div>
        <div className="rounded-2xl border border-slate-700 bg-slate-800/70 p-4">
          <div className="flex items-center gap-2 text-white"><BookOpen size={16} className="text-fuchsia-300" />獎勵流程</div>
          <p className="mt-2 text-sm text-slate-400">學生達成後會先變成可領取，再自行到成就頁按下領獎。</p>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-700 bg-slate-800/70 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">{editingId ? '編輯成就' : '新增成就'}</h2>
            <p className="mt-1 text-sm text-slate-400">先選建立模式，再設定成就條件與獎勵。</p>
          </div>
          {editingId ? (
            <button type="button" onClick={resetForm} className="rounded-lg bg-slate-700 px-3 py-2 text-sm text-white hover:bg-slate-600">
              <X size={16} className="mr-1 inline" />
              取消編輯
            </button>
          ) : null}
        </div>

        <form onSubmit={saveAchievement} className="space-y-5">
          <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm text-slate-300">成就名稱</span>
                  <input
                    value={form.name}
                    onChange={event => setForm(previous => ({ ...previous, name: event.target.value }))}
                    required
                    className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm text-slate-300">建立模式</span>
                  <div className="flex gap-2">
                    {(['simple', 'advanced'] as const).map(mode => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setForm(previous => ({ ...previous, authoring_mode: mode }))}
                        className={`rounded-lg px-3 py-2 text-sm ${
                          form.authoring_mode === mode ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        {mode === 'simple' ? '簡單模式' : '進階模式'}
                      </button>
                    ))}
                  </div>
                </label>

                <label className="space-y-2 md:col-span-2">
                  <span className="text-sm text-slate-300">成就描述</span>
                  <textarea
                    value={form.description}
                    onChange={event => setForm(previous => ({ ...previous, description: event.target.value }))}
                    rows={3}
                    className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white"
                  />
                </label>
              </div>

              <div className="space-y-3 rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-white">
                  <ImagePlus size={16} className="text-fuchsia-300" />
                  Achievement image
                </div>
                <div className="grid gap-4 lg:grid-cols-[140px_1fr]">
                  <div className="aspect-square overflow-hidden rounded-2xl border border-slate-700 bg-slate-950">
                    {form.image_url ? (
                      <img src={form.image_url} alt={form.name || 'Achievement image'} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center px-3 text-center text-xs text-slate-500">No image</div>
                    )}
                  </div>
                  <div className="grid gap-3">
                    <label className="space-y-1">
                      <span className="text-xs text-slate-400">Image URL</span>
                      <input
                        value={form.image_url}
                        onChange={event => setForm(previous => ({ ...previous, image_url: event.target.value }))}
                        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                      />
                    </label>
                    <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-xl bg-slate-700 px-4 py-2 text-sm text-white hover:bg-slate-600">
                      <Upload size={16} />
                      {uploadingImage ? 'Uploading...' : 'Upload image'}
                      <input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => void handleAchievementImageUpload(event)} className="hidden" />
                    </label>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <label className="space-y-1">
                    <span className="text-xs text-slate-400">AI provider</span>
                    <select
                      value={aiProvider}
                      onChange={event => setAiProvider(event.target.value as typeof aiProvider)}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                    >
                      <option value="gemini">Gemini</option>
                      <option value="openai">OpenAI / ChatGPT</option>
                      <option value="huggingface">Hugging Face</option>
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs text-slate-400">Teacher API key optional</span>
                    <input
                      type="password"
                      value={teacherApiKey}
                      onChange={event => setTeacherApiKey(event.target.value)}
                      autoComplete="off"
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                    />
                  </label>
                  {aiProvider === 'huggingface' ? (
                    <>
                      <label className="space-y-1">
                        <span className="text-xs text-slate-400">Hugging Face author</span>
                        <input
                          value={huggingFaceAuthor}
                          onChange={event => setHuggingFaceAuthor(event.target.value)}
                          className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs text-slate-400">Hugging Face model</span>
                        <input
                          value={huggingFaceModelName}
                          onChange={event => setHuggingFaceModelName(event.target.value)}
                          className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                        />
                      </label>
                    </>
                  ) : null}
                  <label className="space-y-1">
                    <span className="text-xs text-slate-400">Style</span>
                    <select
                      value={form.image_style}
                      onChange={event => setForm(previous => ({ ...previous, image_style: event.target.value }))}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                    >
                      {STYLE_OPTIONS.map(style => (
                        <option key={style} value={style}>{style}</option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1 md:col-span-2">
                    <span className="text-xs text-slate-400">Prompt details</span>
                    <textarea
                      value={form.image_prompt}
                      onChange={event => setForm(previous => ({ ...previous, image_prompt: event.target.value }))}
                      rows={2}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                    />
                  </label>
                </div>

                <button
                  type="button"
                  onClick={() => void generateAchievementImage()}
                  disabled={saving || generatingImage || !form.name.trim()}
                  className="inline-flex items-center gap-2 rounded-xl bg-fuchsia-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-fuchsia-500 disabled:opacity-50"
                >
                  {generatingImage ? <RefreshCw size={16} className="animate-spin" /> : <Wand2 size={16} />}
                  {generatingImage ? 'Generating...' : 'Generate achievement image'}
                </button>
              </div>

              {form.authoring_mode === 'simple' ? (
                <div className="space-y-4 rounded-2xl border border-indigo-500/30 bg-indigo-500/10 p-4">
                  <div>
                    <h3 className="font-semibold text-white">簡單模式</h3>
                    <p className="mt-1 text-sm text-slate-300">先選一個最接近的模板，系統只會顯示必要欄位。</p>
                  </div>

                  <label className="space-y-2">
                    <span className="text-sm text-slate-300">成就模板</span>
                    <select
                      value={form.template_key}
                      onChange={event => handleTemplateChange(event.target.value as TemplateKey)}
                      className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white"
                    >
                      {TEMPLATE_OPTIONS.map(option => (
                        <option key={option.key} value={option.key}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-slate-400">{getTemplateMeta(form.template_key).description}</p>
                  </label>

                  {['tasks_completed_total', 'cards_collected_total', 'points_earned_total', 'task_streak_daily', 'task_streak_weekly', 'task_streak_selected'].includes(form.template_key) ? (
                    <label className="space-y-2">
                      <span className="text-sm text-slate-300">
                        {form.progress_mode === 'streak' ? '連續期數' : '目標數量'}
                      </span>
                      <input
                        type="number"
                        min="1"
                        value={form.simple_target_value}
                        onChange={event => setForm(previous => ({ ...previous, simple_target_value: Number(event.target.value) }))}
                        className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white"
                      />
                      <p className="text-xs text-slate-400">
                        {form.template_key === 'points_earned_total'
                          ? '看歷史累積賺過的星星總數。'
                          : form.progress_mode === 'streak'
                            ? '例如 3 代表連續 3 期。'
                            : '例如 10 代表累積完成 10 次。'}
                      </p>
                    </label>
                  ) : null}

                  {form.template_key === 'task_streak_selected' ? (
                    <>
                      <label className="space-y-2">
                        <span className="text-sm text-slate-300">連續週期類型</span>
                        <select
                          value={form.simple_recurrence_type}
                          onChange={event => setForm(previous => ({ ...previous, simple_recurrence_type: event.target.value as 'daily' | 'weekly' }))}
                          className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white"
                        >
                          <option value="daily">每日</option>
                          <option value="weekly">每週</option>
                        </select>
                      </label>
                      {renderTaskSelector(
                        form.simple_selected_task_ids,
                        tasks,
                        toggleSimpleTask,
                        '請勾選要納入這個連續成就的任務。若只勾一個任務，就會變成單一任務連續。'
                      )}
                    </>
                  ) : null}

                  {form.template_key === 'selected_tasks_all_complete' ? (
                    renderTaskSelector(
                      form.simple_selected_task_ids,
                      tasks,
                      toggleSimpleTask,
                      '請直接勾選這個成就要檢查的任務清單。全部完成後才會解鎖。'
                    )
                  ) : null}

                  {form.template_key === 'series_complete' ? (
                    <label className="space-y-2">
                      <span className="text-sm text-slate-300">系列名稱</span>
                      <input
                        value={form.simple_series}
                        onChange={event => setForm(previous => ({ ...previous, simple_series: event.target.value }))}
                        className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white"
                      />
                      <p className="text-xs text-slate-400">請填卡牌的系列名稱，學生必須把該系列全部收齊。</p>
                    </label>
                  ) : null}

                  {form.template_key === 'album_complete' ? (
                    <label className="space-y-2">
                      <span className="text-sm text-slate-300">卡冊</span>
                      <select
                        value={form.simple_album_id}
                        onChange={event => setForm(previous => ({ ...previous, simple_album_id: event.target.value }))}
                        className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white"
                      >
                        <option value="">請選擇卡冊</option>
                        {albums.map(album => (
                          <option key={album.id} value={album.id}>
                            {album.name}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-slate-400">學生需要把這本卡冊裡的卡牌全部收齊。</p>
                    </label>
                  ) : null}

                  <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-white">
                      <Info size={16} className="text-indigo-300" />
                      這次條件預覽
                    </div>
                    <p className="mt-2 text-sm text-slate-300">{conditionSummary(simpleConditionPreview, { albumMap })}</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 rounded-2xl border border-fuchsia-500/30 bg-fuchsia-500/10 p-4">
                  <div>
                    <h3 className="font-semibold text-white">進階模式</h3>
                    <p className="mt-1 text-sm text-slate-300">可加入多個條件，全部條件都成立才會解鎖。第一版固定使用 AND 規則。</p>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="space-y-2">
                      <span className="text-sm text-slate-300">成就分類</span>
                      <select
                        value={form.category}
                        onChange={event => setForm(previous => ({ ...previous, category: event.target.value as AchievementCategory }))}
                        className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white"
                      >
                        {(['task', 'card', 'points', 'mixed'] as const).map(category => (
                          <option key={category} value={category}>
                            {ACHIEVEMENT_CATEGORY_LABELS[category]}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-2">
                      <span className="text-sm text-slate-300">達成方式</span>
                      <select
                        value={form.progress_mode}
                        onChange={event => setForm(previous => ({ ...previous, progress_mode: event.target.value as Achievement['progress_mode'] }))}
                        className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white"
                      >
                        {(['cumulative', 'streak', 'all_complete'] as const).map(mode => (
                          <option key={mode} value={mode}>
                            {ACHIEVEMENT_PROGRESS_MODE_LABELS[mode]}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="space-y-3">
                    {form.conditions.map((condition, index) => (
                      <div key={condition.id} className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-white">條件 {index + 1}</p>
                            <p className="text-xs text-slate-500">全部條件都達成才會解鎖。</p>
                          </div>
                          {form.conditions.length > 1 ? (
                            <button type="button" onClick={() => removeCondition(condition.id)} className="rounded-lg bg-slate-800 px-3 py-2 text-xs text-slate-300 hover:bg-slate-700">
                              移除
                            </button>
                          ) : null}
                        </div>

                        <div className="grid gap-3 md:grid-cols-2">
                          <label className="space-y-2">
                            <span className="text-sm text-slate-300">條件類型</span>
                            <select
                              value={condition.condition_type}
                              onChange={event => updateCondition(condition.id, 'condition_type', event.target.value as AchievementConditionType)}
                              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                            >
                              {ADVANCED_CONDITION_OPTIONS.map(option => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>

                          {!['series_complete', 'album_complete', 'selected_tasks_all_complete'].includes(condition.condition_type) ? (
                            <label className="space-y-2">
                              <span className="text-sm text-slate-300">目標值</span>
                              <input
                                type="number"
                                min="1"
                                value={condition.target_value}
                                onChange={event => updateCondition(condition.id, 'target_value', Number(event.target.value))}
                                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                              />
                            </label>
                          ) : null}
                        </div>

                        {condition.condition_type === 'task_streak_any' || condition.condition_type === 'task_streak_selected' ? (
                          <label className="mt-3 block space-y-2">
                            <span className="text-sm text-slate-300">連續週期</span>
                            <select
                              value={condition.recurrence_type}
                              onChange={event => updateCondition(condition.id, 'recurrence_type', event.target.value as 'daily' | 'weekly')}
                              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                            >
                              <option value="daily">每日</option>
                              <option value="weekly">每週</option>
                            </select>
                          </label>
                        ) : null}

                        {['tasks_completed_selected', 'task_streak_selected', 'selected_tasks_all_complete'].includes(condition.condition_type) ? (
                          <div className="mt-3">
                            {renderTaskSelector(
                              condition.selected_task_ids,
                              tasks,
                              taskId => toggleAdvancedTask(condition.id, taskId),
                              condition.condition_type === 'selected_tasks_all_complete'
                                ? '請勾選這個成就需要全部完成的任務。'
                                : '請勾選要計算的指定任務。'
                            )}
                          </div>
                        ) : null}

                        {condition.condition_type === 'series_complete' ? (
                          <label className="mt-3 block space-y-2">
                            <span className="text-sm text-slate-300">系列名稱</span>
                            <input
                              value={condition.series}
                              onChange={event => updateCondition(condition.id, 'series', event.target.value)}
                              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                            />
                          </label>
                        ) : null}

                        {condition.condition_type === 'album_complete' ? (
                          <label className="mt-3 block space-y-2">
                            <span className="text-sm text-slate-300">卡冊</span>
                            <select
                              value={condition.album_id}
                              onChange={event => updateCondition(condition.id, 'album_id', event.target.value)}
                              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                            >
                              <option value="">請選擇卡冊</option>
                              {albums.map(album => (
                                <option key={album.id} value={album.id}>
                                  {album.name}
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : null}

                        {condition.condition_type === 'rarity_collection' ? (
                          <label className="mt-3 block space-y-2">
                            <span className="text-sm text-slate-300">稀有度</span>
                            <select
                              value={condition.rarity}
                              onChange={event => updateCondition(condition.id, 'rarity', event.target.value as '' | Rarity)}
                              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                            >
                              <option value="">請選擇稀有度</option>
                              {(['N', 'R', 'SR', 'SSR', 'UR'] as const).map(rarity => (
                                <option key={rarity} value={rarity}>
                                  {rarity}
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : null}

                        <p className="mt-3 text-xs text-slate-400">
                          {conditionSummary(condition, { albumMap })}
                        </p>
                      </div>
                    ))}
                  </div>

                  <button type="button" onClick={addCondition} className="rounded-lg bg-slate-700 px-3 py-2 text-sm text-white hover:bg-slate-600">
                    <Plus size={16} className="mr-1 inline" />
                    新增條件
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-4 rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
              <div>
                <h3 className="font-semibold text-white">獎勵與狀態</h3>
                <p className="mt-1 text-sm text-slate-400">成就達成後，學生會在成就頁手動領取這些獎勵。</p>
              </div>

              <label className="space-y-2">
                <span className="text-sm text-slate-300">星星獎勵</span>
                <input
                  type="number"
                  min="0"
                  value={form.points_reward}
                  onChange={event => setForm(previous => ({ ...previous, points_reward: Number(event.target.value) }))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm text-slate-300">卡牌獎勵</span>
                <select
                  value={form.card_reward}
                  onChange={event => setForm(previous => ({ ...previous, card_reward: event.target.value }))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                >
                  <option value="">不設定卡牌獎勵</option>
                  {cards.map(card => (
                    <option key={card.id} value={card.id}>
                      {card.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-sm text-slate-300">排序</span>
                <input
                  type="number"
                  value={form.sort_order}
                  onChange={event => setForm(previous => ({ ...previous, sort_order: Number(event.target.value) }))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                />
              </label>

              <label className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={event => setForm(previous => ({ ...previous, is_active: event.target.checked }))}
                  className="accent-indigo-500"
                />
                啟用這個成就
              </label>

              {form.is_preset ? (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
                  這筆資料來自預設草稿，老師可以直接改成正式成就。
                </div>
              ) : null}

              {message ? <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">{message}</div> : null}
              {error ? <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-100">{error}</div> : null}

              <button disabled={saving} className="w-full rounded-xl bg-indigo-600 px-5 py-3 font-medium text-white hover:bg-indigo-500 disabled:opacity-50">
                <Save size={18} className="mr-2 inline" />
                {saving ? '儲存中...' : editingId ? '更新成就' : '新增成就'}
              </button>
            </div>
          </div>
        </form>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {FILTER_OPTIONS.map(option => (
            <button
              key={option.key}
              type="button"
              onClick={() => setFilter(option.key)}
              className={`rounded-full px-3 py-1.5 text-sm ${
                filter === option.key ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="grid gap-3">
          {filteredAchievements.map(achievement => (
            <div key={achievement.id} className="rounded-2xl border border-slate-700 bg-slate-800/70 p-4">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="flex gap-3">
                  {achievement.image_url || achievement.icon_url ? (
                    <div className="mt-1 h-11 w-11 overflow-hidden rounded-xl border border-white/10 bg-slate-950">
                      <img src={achievement.image_url ?? achievement.icon_url ?? ''} alt={achievement.name} className="h-full w-full object-cover" />
                    </div>
                  ) : (
                    <div className={`mt-1 flex h-11 w-11 items-center justify-center rounded-xl ${achievement.is_active ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-700 text-slate-500'}`}>
                      <Trophy size={22} />
                    </div>
                  )}
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-white">{achievement.name}</h3>
                      <span className="rounded-full bg-slate-700 px-2.5 py-1 text-xs text-slate-200">
                        {ACHIEVEMENT_PROGRESS_MODE_LABELS[achievement.progress_mode]}
                      </span>
                      <span className="rounded-full bg-slate-700 px-2.5 py-1 text-xs text-slate-200">
                        {ACHIEVEMENT_CATEGORY_LABELS[achievement.category]}
                      </span>
                      <span className="rounded-full bg-slate-700 px-2.5 py-1 text-xs text-slate-200">手動領獎</span>
                      {achievement.is_preset ? (
                        <span className="rounded-full bg-amber-500/20 px-2.5 py-1 text-xs text-amber-200">預設草稿</span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm text-slate-400">{achievement.description || '尚未填寫描述'}</p>
                    <div className="mt-3 space-y-1 text-xs text-slate-500">
                      {(achievement.achievement_conditions ?? []).map(condition => (
                        <p key={condition.id}>- {conditionSummary(condition, { albumMap })}</p>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-amber-300">
                      星星獎勵 {achievement.points_reward}
                      {achievement.card_reward ? ' · 含卡牌獎勵' : ''}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-xs ${achievement.is_active ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-700 text-slate-400'}`}>
                    {achievement.is_active ? '啟用中' : '未啟用'}
                  </span>
                  <button
                    type="button"
                    onClick={() => beginEdit(achievement)}
                    className="rounded-lg bg-amber-600/20 px-3 py-2 text-sm text-amber-300 hover:bg-amber-600/30"
                  >
                    <Pencil size={16} className="mr-1 inline" />
                    編輯
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleActive(achievement)}
                    className={`rounded-lg px-3 py-2 text-sm ${
                      achievement.is_active
                        ? 'bg-red-600/20 text-red-300 hover:bg-red-600/30'
                        : 'bg-green-600/20 text-green-300 hover:bg-green-600/30'
                    }`}
                  >
                    {achievement.is_active ? <PowerOff size={16} className="mr-1 inline" /> : <Power size={16} className="mr-1 inline" />}
                    {achievement.is_active ? '停用' : '啟用'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
