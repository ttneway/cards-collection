import { useEffect, useMemo, useState } from 'react'
import { Crown, Shield, ShoppingBag, Star, Wand2 } from 'lucide-react'
import { resolveProfessionImageUrl } from '../lib/professionImages'
import { supabase } from '../lib/supabase'
import { EFFECT_LABELS, SLOT_LABELS, formatEffectValue, formatEquipmentRarity, getTierLabel } from '../lib/character'
import { useAuthStore } from '../stores/authStore'
import type {
  CharacterGender,
  CharacterProfilePayload,
  ComputedCharacterBonus,
  EquipmentSlotType,
  EquipmentTemplate,
  PlayerEquipment,
  PlayerEquippedItem,
  PlayerProfession,
  ProfessionEffectType,
} from '../types'

type InventoryRow = PlayerEquipment & {
  equipment: EquipmentTemplate
}

const SLOT_ORDER: EquipmentSlotType[] = ['headwear', 'necklace', 'ring', 'pet']

function getProgressPercent(payload: CharacterProfilePayload | null) {
  if (!payload) return 0
  return Math.max(0, Math.min(100, Number(payload.level_progress.progress_percent ?? 0)))
}

export default function CharacterPage() {
  const { user, refreshProfile } = useAuthStore()
  const [profile, setProfile] = useState<CharacterProfilePayload | null>(null)
  const [inventory, setInventory] = useState<InventoryRow[]>([])
  const [equippedItems, setEquippedItems] = useState<PlayerEquippedItem[]>([])
  const [shopItems, setShopItems] = useState<EquipmentTemplate[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [savingGender, setSavingGender] = useState(false)

  const equippedMap = useMemo(() => {
    return equippedItems.reduce<Record<string, PlayerEquippedItem>>((accumulator, item) => {
      accumulator[item.slot_type] = item
      return accumulator
    }, {})
  }, [equippedItems])

  const equippedInventoryMap = useMemo(() => {
    return inventory.reduce<Record<string, InventoryRow>>((accumulator, item) => {
      accumulator[item.id] = item
      return accumulator
    }, {})
  }, [inventory])

  const groupedInventory = useMemo(() => {
    return SLOT_ORDER.map(slot => ({
      slot,
      items: inventory.filter(item => item.equipment.slot_type === slot),
    }))
  }, [inventory])

  useEffect(() => {
    if (!user) return
    void loadCharacterData()
  }, [user?.id])

  const loadCharacterData = async () => {
    if (!user) return

    setLoading(true)
    setError(null)

    const [profileResult, inventoryResult, equippedResult, shopResult] = await Promise.all([
      supabase.rpc('get_character_profile', { p_user_id: user.id }),
      supabase
        .from('player_equipments')
        .select('*, equipment:equipment_id(*, equipment_effects(*))')
        .eq('user_id', user.id)
        .gt('quantity', 0)
        .order('acquired_at', { ascending: false }),
      supabase.from('player_equipped_items').select('*').eq('user_id', user.id),
      supabase
        .from('equipment_templates')
        .select('*, equipment_effects(*)')
        .eq('is_active', true)
        .not('shop_cost', 'is', null)
        .order('shop_cost', { ascending: true }),
    ])

    if (profileResult.error) {
      setError(profileResult.error.message)
    } else {
      setProfile(profileResult.data as CharacterProfilePayload)
    }

    if (inventoryResult.error) {
      setError(inventoryResult.error.message)
    } else {
      setInventory((inventoryResult.data ?? []) as InventoryRow[])
    }

    if (equippedResult.error) {
      setError(equippedResult.error.message)
    } else {
      setEquippedItems((equippedResult.data ?? []) as PlayerEquippedItem[])
    }

    if (shopResult.error) {
      setError(shopResult.error.message)
    } else {
      setShopItems((shopResult.data ?? []) as EquipmentTemplate[])
    }

    setLoading(false)
  }

  const runRpcAction = async (key: string, action: () => PromiseLike<any>) => {
    setBusyKey(key)
    setMessage(null)
    setError(null)

    const { data, error } = (await action()) as { data: any; error: any }

    if (error) {
      setError(error.message)
    } else {
      setMessage(data?.message ?? '操作完成。')
      await Promise.all([loadCharacterData(), refreshProfile()])
    }

    setBusyKey(null)
  }

  const renderSquareImage = (imageUrl: string | null | undefined, alt: string, fallbackText: string, className = 'h-16 w-16') => {
    if (imageUrl) {
      return (
        <div className={`${className} overflow-hidden rounded-2xl border border-white/10 bg-slate-950/60`}>
          <img src={imageUrl} alt={alt} className="h-full w-full object-cover" />
        </div>
      )
    }

    return (
      <div className={`${className} flex items-center justify-center whitespace-pre-line rounded-2xl border border-dashed border-slate-700 bg-slate-900/60 px-2 text-center text-[11px] leading-tight text-slate-500`}>
        {fallbackText}
      </div>
    )
  }

  const renderBonusSection = (title: string, items: Array<{ source_name: string; effect_type: string; value: number }>) => (
    <div className="rounded-2xl border border-slate-700 bg-slate-800/70 p-4">
      <h3 className="mb-3 font-semibold text-white">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-slate-500">目前沒有加成。</p>
      ) : (
        <div className="space-y-2">
          {items.map((item, index) => (
            <div key={`${item.source_name}-${item.effect_type}-${index}`} className="flex items-center justify-between gap-4 rounded-xl bg-slate-900/60 px-3 py-2 text-sm">
              <div>
                <p className="text-slate-100">{item.source_name}</p>
                <p className="text-xs text-slate-500">{EFFECT_LABELS[item.effect_type as keyof typeof EFFECT_LABELS] ?? item.effect_type}</p>
              </div>
              <span className="font-semibold text-emerald-300">
                {formatEffectValue(item.effect_type as keyof typeof EFFECT_LABELS, Number(item.value))}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  if (loading) {
    return <div className="py-16 text-center text-slate-400">讀取角色資料中...</div>
  }

  if (!profile) {
    return <div className="py-16 text-center text-rose-300">角色資料讀取失敗。</div>
  }

  const bonus = profile.bonuses as ComputedCharacterBonus
  const primaryProfession = profile.current_profession
  const progressPercent = getProgressPercent(profile)
  const currentGender = user?.gender ?? null

  const updateGender = async (gender: CharacterGender) => {
    if (!user || savingGender || user.gender === gender) return

    setSavingGender(true)
    setMessage(null)
    setError(null)

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ gender })
      .eq('id', user.id)

    if (updateError) {
      setError(updateError.message)
      setSavingGender(false)
      return
    }

    await refreshProfile()
    setMessage(gender === 'male' ? '已切換為男生形象。' : '已切換為女生形象。')
    setSavingGender(false)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">角色養成</h1>
        <p className="mt-1 text-sm text-slate-400">
          查看目前等級、主職業、裝備與所有加成效果。
        </p>
      </div>

      {message ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {message}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      <section className="rounded-3xl border border-indigo-500/20 bg-gradient-to-br from-slate-800 to-slate-900 p-5 shadow-xl">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            {renderSquareImage(resolveProfessionImageUrl(primaryProfession, currentGender), primaryProfession?.name ?? '主職業', '未設定\n職業圖', 'h-20 w-20')}
            <div>
              <p className="text-sm text-indigo-300">角色等級</p>
              <div className="mt-1 flex items-end gap-3">
                <span className="text-5xl font-black text-white">{profile.progress.level}</span>
                <span className="pb-1 text-slate-400">累積點數 {profile.progress.earned_points_total}</span>
              </div>
              <p className="mt-2 text-sm text-slate-400">
                主職業：{primaryProfession?.name ?? '尚未選擇主職業'}
              </p>
            </div>
          </div>

          <div className="rounded-2xl bg-slate-900/70 px-4 py-3 text-sm text-slate-300">
            <p>已解鎖職業 {profile.unlocked_professions.length} 個</p>
            <p className="mt-1">可選新職業次數 {profile.progress.available_unlocks}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-slate-900/60 px-4 py-3">
          <span className="text-sm text-slate-300">角色形象</span>
          <div className="inline-flex rounded-xl border border-slate-700 bg-slate-950/80 p-1">
            {[
              { value: 'male' as const, label: '男生' },
              { value: 'female' as const, label: '女生' },
            ].map(option => (
              <button
                key={option.value}
                type="button"
                onClick={() => void updateGender(option.value)}
                disabled={savingGender}
                className={`rounded-lg px-3 py-1.5 text-sm transition ${
                  currentGender === option.value
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800'
                } disabled:opacity-50`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <span className="text-xs text-slate-500">
            會影響職業圖片顯示；若沒有男女分圖，會自動改用預設圖。
          </span>
        </div>

        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
            <span>升級進度</span>
            <span>{progressPercent.toFixed(2)}%</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-slate-900">
            <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      </section>

      {profile.available_profession_choices.length > 0 ? (
        <section className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-5">
          <div className="flex items-center gap-2">
            <Wand2 size={18} className="text-amber-300" />
            <h2 className="text-lg font-semibold text-amber-100">可解鎖的新職業</h2>
          </div>
          <p className="mt-1 text-sm text-amber-100/80">
            你已達到 {getTierLabel(profile.progress.next_choice_tier)}，可以選擇新的職業。
          </p>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {profile.available_profession_choices.map(choice => (
              <div key={choice.id} className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    {renderSquareImage(resolveProfessionImageUrl(choice, currentGender), choice.name, '未設定\n職業圖')}
                    <div>
                      <h3 className="font-semibold text-white">{choice.name}</h3>
                      <p className="mt-1 text-sm text-slate-400">{choice.description}</p>
                    </div>
                  </div>
                  <span className="rounded-full px-2.5 py-1 text-xs font-medium text-white" style={{ backgroundColor: choice.theme_color }}>
                    {getTierLabel(choice.unlock_tier)}
                  </span>
                </div>

                <div className="mt-3 space-y-2 text-sm">
                  {(choice.effects ?? []).map(effect => (
                    <div key={effect.id} className="flex items-center justify-between rounded-xl bg-slate-800 px-3 py-2">
                      <span className="text-slate-200">{EFFECT_LABELS[effect.effect_type]}</span>
                      <span className="font-semibold text-emerald-300">
                        {formatEffectValue(effect.effect_type, effect.base_value)}
                      </span>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => runRpcAction(`unlock-${choice.id}`, () => supabase.rpc('claim_profession_unlock', { p_profession_id: choice.id }))}
                  disabled={busyKey === `unlock-${choice.id}`}
                  className="mt-4 w-full rounded-xl bg-amber-500 px-4 py-2.5 font-medium text-slate-950 transition hover:bg-amber-400 disabled:opacity-50"
                >
                  {busyKey === `unlock-${choice.id}` ? '解鎖中...' : '解鎖這個職業'}
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-700 bg-slate-800/70 p-5">
          <div className="flex items-center gap-2">
            <Crown size={18} className="text-indigo-300" />
            <h2 className="text-lg font-semibold text-white">已解鎖職業</h2>
          </div>

          <div className="mt-4 space-y-3">
            {profile.unlocked_professions.length === 0 ? (
              <p className="text-sm text-slate-500">10 級後會開始解鎖職業。</p>
            ) : (
              profile.unlocked_professions.map((profession: PlayerProfession) => (
                <div key={profession.id} className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      {renderSquareImage(resolveProfessionImageUrl(profession.profession, currentGender), profession.profession?.name ?? '職業', '未設定\n職業圖')}
                      <div>
                        <h3 className="font-semibold text-white">{profession.profession?.name}</h3>
                        <p className="mt-1 text-sm text-slate-400">{profession.profession?.description}</p>
                      </div>
                    </div>
                    {profession.equipped_as_primary ? (
                      <span className="rounded-full bg-indigo-500/20 px-2.5 py-1 text-xs font-medium text-indigo-300">主職業</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => runRpcAction(`switch-${profession.id}`, () => supabase.rpc('switch_primary_profession', { p_player_profession_id: profession.id }))}
                        disabled={busyKey === `switch-${profession.id}`}
                        className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-600 disabled:opacity-50"
                      >
                        設為主職業
                      </button>
                    )}
                  </div>

                  {!profession.equipped_as_primary && Object.keys(profession.frozen_effect_snapshot ?? {}).length > 0 ? (
                    <div className="mt-3 rounded-xl bg-slate-800 px-3 py-3 text-sm">
                      <p className="mb-2 text-xs uppercase tracking-wide text-slate-400">保留中的舊職業效果</p>
                      <div className="space-y-2">
                        {Object.entries(profession.frozen_effect_snapshot).map(([effectType, value]) => (
                          <div key={effectType} className="flex items-center justify-between">
                            <span className="text-slate-200">{EFFECT_LABELS[effectType as keyof typeof EFFECT_LABELS] ?? effectType}</span>
                            <span className="font-semibold text-emerald-300">
                              {formatEffectValue(effectType as keyof typeof EFFECT_LABELS, Number(value))}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="space-y-4">
          {renderBonusSection('主職業效果', bonus.breakdown.primary)}
          {renderBonusSection('保留職業效果', bonus.breakdown.archived)}
          {renderBonusSection('裝備效果', bonus.breakdown.equipment)}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-700 bg-slate-800/70 p-5">
        <div className="flex items-center gap-2">
          <Shield size={18} className="text-violet-300" />
          <h2 className="text-lg font-semibold text-white">目前裝備</h2>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {SLOT_ORDER.map(slot => {
            const equipped = equippedMap[slot]
            const item = equipped ? equippedInventoryMap[equipped.player_equipment_id] : null

            return (
              <div key={slot} className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
                <p className="text-sm font-medium text-slate-300">{SLOT_LABELS[slot]}</p>
                {item ? (
                  <>
                    <div className="mt-3">
                      {renderSquareImage(item.equipment.image_url, item.equipment.name, '未設定\n裝備圖', 'h-20 w-20')}
                    </div>
                    <p className="mt-3 font-semibold text-white">{item.equipment.name}</p>
                    <p className="text-xs text-slate-500">{formatEquipmentRarity(item.equipment.rarity)}</p>
                    <button
                      type="button"
                      onClick={() => runRpcAction(`unequip-${slot}`, () => supabase.rpc('unequip_item', { p_slot_type: slot }))}
                      disabled={busyKey === `unequip-${slot}`}
                      className="mt-3 w-full rounded-lg bg-slate-700 px-3 py-2 text-sm text-white hover:bg-slate-600 disabled:opacity-50"
                    >
                      卸下
                    </button>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">尚未裝備</p>
                )}
              </div>
            )
          })}
        </div>

        <div className="mt-6 space-y-4">
          {groupedInventory.map(group => (
            <div key={group.slot}>
              <h3 className="mb-2 text-sm font-semibold text-slate-300">{SLOT_LABELS[group.slot]}持有裝備</h3>
              {group.items.length === 0 ? (
                <p className="text-sm text-slate-500">目前沒有這個欄位的裝備。</p>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {group.items.map(item => (
                    <div key={item.id} className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          {renderSquareImage(item.equipment.image_url, item.equipment.name, '未設定\n裝備圖')}
                          <div>
                            <p className="font-semibold text-white">{item.equipment.name}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              {formatEquipmentRarity(item.equipment.rarity)} · 持有 {item.quantity} 件
                            </p>
                          </div>
                        </div>
                        <span className="rounded-full bg-slate-800 px-2 py-1 text-xs text-slate-300">
                          {SLOT_LABELS[item.equipment.slot_type]}
                        </span>
                      </div>

                      <div className="mt-3 space-y-2">
                        {(item.equipment.equipment_effects ?? []).map(effect => (
                          <div key={effect.id} className="flex items-center justify-between rounded-xl bg-slate-800 px-3 py-2 text-sm">
                            <span className="text-slate-200">{EFFECT_LABELS[effect.effect_type]}</span>
                            <span className="font-semibold text-emerald-300">
                              {formatEffectValue(effect.effect_type, effect.base_value)}
                            </span>
                          </div>
                        ))}
                      </div>

                      <button
                        type="button"
                        onClick={() => runRpcAction(`equip-${item.id}`, () => supabase.rpc('equip_item', { p_player_equipment_id: item.id, p_slot_type: item.equipment.slot_type }))}
                        disabled={busyKey === `equip-${item.id}`}
                        className="mt-4 w-full rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-violet-500 disabled:opacity-50"
                      >
                        裝備
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-700 bg-slate-800/70 p-5">
        <div className="flex items-center gap-2">
          <ShoppingBag size={18} className="text-amber-300" />
          <h2 className="text-lg font-semibold text-white">角色商店</h2>
        </div>
        <p className="mt-1 text-sm text-slate-400">可以用星星購買裝備，買到後會進入你的裝備庫。</p>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {shopItems.length === 0 ? (
            <p className="text-sm text-slate-500">目前沒有可購買的裝備。</p>
          ) : (
            shopItems.map(item => (
              <div key={item.id} className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    {renderSquareImage(item.image_url, item.name, '未設定\n裝備圖')}
                    <div>
                      <p className="font-semibold text-white">{item.name}</p>
                      <p className="mt-1 text-sm text-slate-400">{item.description || '尚未填寫裝備說明。'}</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-amber-500/20 px-2 py-1 text-xs font-medium text-amber-300">
                    {item.shop_cost} 星
                  </span>
                </div>

                <div className="mt-3 space-y-2">
                  {(item.equipment_effects ?? []).map(effect => (
                    <div key={effect.id} className="flex items-center justify-between rounded-xl bg-slate-800 px-3 py-2 text-sm">
                      <span className="text-slate-200">{EFFECT_LABELS[effect.effect_type]}</span>
                      <span className="font-semibold text-emerald-300">
                        {formatEffectValue(effect.effect_type, effect.base_value)}
                      </span>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => runRpcAction(`buy-${item.id}`, () => supabase.rpc('purchase_equipment', { p_equipment_id: item.id }))}
                  disabled={busyKey === `buy-${item.id}`}
                  className="mt-4 w-full rounded-xl bg-amber-500 px-4 py-2.5 font-medium text-slate-950 transition hover:bg-amber-400 disabled:opacity-50"
                >
                  {busyKey === `buy-${item.id}` ? '購買中...' : '購買裝備'}
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-700 bg-slate-800/70 p-5">
        <div className="flex items-center gap-2">
          <Star size={18} className="text-emerald-300" />
          <h2 className="text-lg font-semibold text-white">總加成一覽</h2>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {Object.entries(bonus.summary).map(([effectType, value]) => (
            <div key={effectType} className="rounded-xl bg-slate-900/60 px-4 py-3">
              <p className="text-sm text-slate-400">{EFFECT_LABELS[effectType as ProfessionEffectType] ?? effectType}</p>
              <p className="mt-1 text-lg font-semibold text-white">
                {formatEffectValue(effectType as ProfessionEffectType, Number(value))}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
