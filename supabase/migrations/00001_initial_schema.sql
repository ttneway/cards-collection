-- Profiles (extends Supabase auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  student_id TEXT UNIQUE,
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'leader', 'teacher')),
  class_id UUID,
  stars INTEGER NOT NULL DEFAULT 0,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Classes
CREATE TABLE classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  grade INTEGER NOT NULL,
  teacher_id UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE profiles ADD CONSTRAINT fk_class FOREIGN KEY (class_id) REFERENCES classes(id);

-- Class leaders (多對多)
CREATE TABLE class_leaders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(class_id, user_id)
);

-- Cards
CREATE TABLE cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  rarity TEXT NOT NULL CHECK (rarity IN ('N', 'R', 'SR', 'SSR', 'UR')),
  description TEXT DEFAULT '',
  series TEXT NOT NULL DEFAULT '一般',
  image_url TEXT,
  color TEXT NOT NULL DEFAULT '#334155',
  is_limited BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User cards
CREATE TABLE user_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  count INTEGER NOT NULL DEFAULT 1,
  acquired_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, card_id)
);

-- Card packs
CREATE TABLE card_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  cost INTEGER NOT NULL DEFAULT 100,
  image_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pack contents (with weight for probability)
CREATE TABLE pack_contents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id UUID NOT NULL REFERENCES card_packs(id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  weight INTEGER NOT NULL DEFAULT 1
);

-- Tasks
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  type TEXT NOT NULL DEFAULT 'scan' CHECK (type IN ('scan', 'approve', 'auto')),
  points INTEGER NOT NULL DEFAULT 10,
  task_code TEXT UNIQUE,
  created_by UUID NOT NULL REFERENCES profiles(id),
  class_id UUID REFERENCES classes(id),
  is_active BOOLEAN DEFAULT true,
  max_completions INTEGER,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Task rewards (cards)
CREATE TABLE task_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE
);

-- Task completions
CREATE TABLE task_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ DEFAULT NOW(),
  approved_by UUID REFERENCES profiles(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected'))
);

-- Achievements
CREATE TABLE achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  icon_url TEXT,
  condition_type TEXT NOT NULL CHECK (condition_type IN ('cards_collected', 'points', 'tasks_completed', 'series_complete', 'rarity_collection')),
  condition_value INTEGER NOT NULL DEFAULT 1,
  condition_card_id UUID REFERENCES cards(id),
  condition_series TEXT,
  condition_rarity TEXT CHECK (condition_rarity IN ('N', 'R', 'SR', 'SSR', 'UR')),
  card_reward UUID REFERENCES cards(id),
  points_reward INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User achievements
CREATE TABLE user_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  achievement_id UUID NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  unlocked_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, achievement_id)
);

-- Transactions (star ledger)
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('earn', 'spend', 'trade')),
  amount INTEGER NOT NULL,
  description TEXT DEFAULT '',
  related_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trades
CREATE TABLE trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  to_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  offered_card_id UUID NOT NULL REFERENCES cards(id),
  requested_card_id UUID NOT NULL REFERENCES cards(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_user_cards_user ON user_cards(user_id);
CREATE INDEX idx_task_completions_user ON task_completions(user_id);
CREATE INDEX idx_task_completions_status ON task_completions(status);
CREATE INDEX idx_tasks_active ON tasks(is_active);
CREATE INDEX idx_cards_rarity ON cards(rarity);

-- RLS (Row Level Security)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_leaders ENABLE ROW LEVEL SECURITY;
ALTER TABLE cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE pack_contents ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read own, teachers can read all
CREATE POLICY profiles_read_own ON profiles FOR SELECT
  USING (auth.uid() = id OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'teacher'));

CREATE POLICY profiles_update_own ON profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY profiles_insert_own ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- User cards
CREATE POLICY user_cards_select_own ON user_cards FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY user_cards_insert_own ON user_cards FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY user_cards_update_own ON user_cards FOR UPDATE
  USING (auth.uid() = user_id);

-- Tasks
CREATE POLICY tasks_select_active ON tasks FOR SELECT
  USING (is_active = true);

CREATE POLICY tasks_manage_teacher ON tasks FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'teacher'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'teacher'));

-- Task completions
CREATE POLICY task_completions_select_own ON task_completions FOR SELECT
  USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('teacher', 'leader')));

CREATE POLICY task_completions_insert_own ON task_completions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY task_completions_update_leader ON task_completions FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('teacher', 'leader')));

-- Achievements
CREATE POLICY achievements_select_active ON achievements FOR SELECT
  USING (is_active = true);

CREATE POLICY achievements_manage_teacher ON achievements FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'teacher'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'teacher'));

-- User achievements
CREATE POLICY user_achievements_select_own ON user_achievements FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY user_achievements_insert_own ON user_achievements FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Card packs
CREATE POLICY card_packs_select_active ON card_packs FOR SELECT
  USING (is_active = true);

CREATE POLICY card_packs_manage_teacher ON card_packs FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'teacher'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'teacher'));

-- Pack contents
CREATE POLICY pack_contents_select ON pack_contents FOR SELECT
  USING (EXISTS (SELECT 1 FROM card_packs WHERE id = pack_id AND is_active = true));

-- Transactions
CREATE POLICY transactions_select_own ON transactions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY transactions_insert_own ON transactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Trades
CREATE POLICY trades_select_involved ON trades FOR SELECT
  USING (auth.uid() = from_user_id OR auth.uid() = to_user_id OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'teacher'));

CREATE POLICY trades_insert_own ON trades FOR INSERT
  WITH CHECK (auth.uid() = from_user_id);

CREATE POLICY trades_update_approve ON trades FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('teacher', 'leader')));

-- Classes
CREATE POLICY classes_select_member ON classes FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE (id = auth.uid() AND class_id = classes.id) OR role = 'teacher'));

CREATE POLICY classes_manage_teacher ON classes FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'teacher'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'teacher'));

-- Class leaders
CREATE POLICY class_leaders_select ON class_leaders FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (class_id = class_leaders.class_id OR role = 'teacher')));

CREATE POLICY class_leaders_manage_teacher ON class_leaders FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'teacher'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'teacher'));

-- Task rewards
CREATE POLICY task_rewards_select ON task_rewards FOR SELECT
  USING (EXISTS (SELECT 1 FROM tasks WHERE id = task_id AND is_active = true));

-- Cards: everyone can read active cards
CREATE POLICY cards_read_active ON cards FOR SELECT
  USING (is_active = true);

-- Teachers can manage cards
CREATE POLICY cards_manage ON cards FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'teacher'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'teacher'));

-- Functions
CREATE OR REPLACE FUNCTION award_task_points(p_user_id UUID, p_task_id UUID)
RETURNS void AS $$
DECLARE
  v_points INTEGER;
  v_task_type TEXT;
BEGIN
  SELECT points, type INTO v_points, v_task_type FROM tasks WHERE id = p_task_id;
  IF v_task_type = 'scan' THEN
    UPDATE profiles SET stars = stars + v_points WHERE id = p_user_id;
    INSERT INTO transactions (user_id, type, amount, description, related_id)
    VALUES (p_user_id, 'earn', v_points, '任務獎勵', p_task_id);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION purchase_pack(p_user_id UUID, p_pack_id UUID)
RETURNS UUID AS $$
DECLARE
  v_cost INTEGER;
  v_total_weight INTEGER;
  v_rand INTEGER;
  v_cumulative INTEGER := 0;
  v_selected_card_id UUID;
  v_existing_count INTEGER;
  v_user_card_id UUID;
BEGIN
  SELECT cost INTO v_cost FROM card_packs WHERE id = p_pack_id;
  IF (SELECT stars FROM profiles WHERE id = p_user_id) < v_cost THEN
    RAISE EXCEPTION '星星不足';
  END IF;

  UPDATE profiles SET stars = stars - v_cost WHERE id = p_user_id;
  INSERT INTO transactions (user_id, type, amount, description, related_id)
  VALUES (p_user_id, 'spend', -v_cost, '購買卡包', p_pack_id);

  SELECT SUM(weight) INTO v_total_weight FROM pack_contents WHERE pack_id = p_pack_id;
  v_rand := floor(random() * v_total_weight)::INTEGER;

  FOR v_selected_card_id IN SELECT card_id FROM pack_contents WHERE pack_id = p_pack_id ORDER BY card_id
  LOOP
    SELECT weight INTO v_cumulative FROM pack_contents WHERE pack_id = p_pack_id AND card_id = v_selected_card_id;
    v_cumulative := v_cumulative + v_cumulative;
    IF v_rand < v_cumulative THEN
      EXIT;
    END IF;
  END LOOP;

  SELECT count INTO v_existing_count FROM user_cards WHERE user_id = p_user_id AND card_id = v_selected_card_id;
  IF v_existing_count > 0 THEN
    UPDATE user_cards SET count = count + 1 WHERE user_id = p_user_id AND card_id = v_selected_card_id;
  ELSE
    INSERT INTO user_cards (user_id, card_id, count) VALUES (p_user_id, v_selected_card_id, 1);
  END IF;

  RETURN v_selected_card_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Seed data: sample cards
INSERT INTO cards (name, rarity, description, series, color) VALUES
  ('校徽之星', 'N', '學校的象徵', '校園', '#64748b'),
  ('書本精靈', 'N', '愛讀書的小精靈', '學科', '#64748b'),
  ('數學小達人', 'R', '數學高手', '學科', '#22c55e'),
  ('英語大使', 'R', '英語能力出眾', '學科', '#22c55e'),
  ('運動健將', 'SR', '體育場上的王者', '體育', '#3b82f6'),
  ('音樂才子', 'SR', '音樂才華洋溢', '才藝', '#3b82f6'),
  ('科學家', 'SSR', '未來的科學之星', '學科', '#a855f7'),
  ('社長大人', 'SSR', '社團的領袖', '社團', '#a855f7'),
  ('傳說之星', 'UR', '全校最耀眼的存在', '榮譽', '#f59e0b'),
  ('完美全勤', 'UR', '從不缺席的模範生', '榮譽', '#f59e0b');

-- Seed data: sample card pack
INSERT INTO card_packs (name, description, cost) VALUES ('校園基礎包', '包含各種校園主題卡牌', 50);

INSERT INTO pack_contents (pack_id, card_id, weight)
SELECT p.id, c.id, CASE c.rarity
  WHEN 'N' THEN 40 WHEN 'R' THEN 30 WHEN 'SR' THEN 18 WHEN 'SSR' THEN 10 WHEN 'UR' THEN 2
END
FROM card_packs p CROSS JOIN cards c WHERE p.name = '校園基礎包';
