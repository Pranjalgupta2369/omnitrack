insert into public.achievements (id, title, description, icon, metric, threshold, xp_reward, sort_order) values
  ('first_step',     'First step',        'Complete your first habit.',                  'footsteps',      'total_completions',      1,  10, 10),
  ('streak_3',       'Warming up',        'Keep a 3-day streak.',                        'flame',          'current_streak',         3,  20, 20),
  ('streak_7',       'One full week',     'Keep a 7-day streak.',                        'flame',          'current_streak',         7,  50, 30),
  ('streak_30',      'Thirty and counting','Reach a 30-day streak.',                     'flame',          'longest_streak',        30, 200, 40),
  ('hands_free_10',  'Hands-free x10',    'Log 10 habits without touching the app.',     'hardware-chip',  'hands_free_completions',10,  30, 50),
  ('hands_free_100', 'Hub native',        'Log 100 habits without touching the app.',    'hardware-chip',  'hands_free_completions',100,150, 60),
  ('completions_50', 'Fifty down',        'Complete 50 habits.',                         'checkmark-done', 'total_completions',     50,  50, 70),
  ('xp_500',         'Level climber',     'Earn 500 XP.',                                'trophy',         'total_xp',             500,   0, 80)
on conflict (id) do nothing;
