import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { ShoppingBag, Star } from 'lucide-react'
import type { CardPack } from '../types'

export default function ShopPage() {
  const { user } = useAuthStore()
  const [packs, setPacks] = useState<CardPack[]>([])
  const [buying, setBuying] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('card_packs').select('*').eq('is_active', true).then(({ data }) => {
      if (data) setPacks(data)
    })
  }, [])

  const buyPack = async (packId: string) => {
    if (!user) return
    setBuying(packId)
    const { error } = await supabase.rpc('purchase_pack', {
      p_user_id: user.id,
      p_pack_id: packId
    })
    if (error) {
      alert(error.message)
    } else {
      alert('抽卡成功！')
    }
    setBuying(null)
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">卡牌商店</h1>

      {packs.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <ShoppingBag size={48} className="mx-auto mb-3 text-slate-600" />
          <p>目前沒有可購買的卡包</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {packs.map(pack => (
            <div key={pack.id} className="bg-slate-800 rounded-xl p-4 flex items-center gap-4">
              <div className="w-20 h-24 bg-indigo-900/50 rounded-xl flex items-center justify-center text-indigo-400">
                <ShoppingBag size={32} />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold">{pack.name}</h3>
                <p className="text-sm text-slate-400">{pack.description}</p>
                <div className="flex items-center gap-1 mt-2 text-amber-400 text-sm font-medium">
                  <Star size={14} fill="currentColor" />
                  <span>{pack.cost} 星星</span>
                </div>
              </div>
              <button
                onClick={() => buyPack(pack.id)}
                disabled={buying === pack.id || (user?.stars ?? 0) < pack.cost}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white px-4 py-2 rounded-lg text-sm font-medium cursor-pointer disabled:cursor-not-allowed"
              >
                {buying === pack.id ? '抽卡中...' : '購買'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
