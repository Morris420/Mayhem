<?php

namespace App\Support;

use App\Models\ExerciseLog;
use App\Models\Skill;
use App\Models\SkillXp;
use App\Models\TaskCompletion;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Turns everything you do into skill XP.
 *
 * Sources: quests (their tier XP goes to the quest's skill), gym (a workout day and every personal
 * record feed Strength), diet (a day on target feeds Stamina). refresh() rebuilds what you *should*
 * have from your history and adds whatever is missing, so it is safe to call as often as you like
 * and never counts anything twice (the unique `ref` column guards that).
 */
class SkillService
{
    public const GYM_DAY_XP = 30;

    public const GYM_RECORD_XP = 15;

    public const DIET_DAY_XP = 25;

    /**
     * @return array<int, array{skill: string, name: string, icon: string, level: int}> skills that gained a level
     */
    public function refresh(User $user): array
    {
        $skills = Skill::all()->keyBy('slug');
        $before = $this->levels($user);

        $wanted = $this->wanted($user, $skills);
        $have = SkillXp::where('user_id', $user->id)->pluck('id', 'ref');

        $rows = [];
        foreach ($wanted as $ref => $row) {
            if (! $have->has($ref)) {
                $rows[] = $row + ['user_id' => $user->id, 'ref' => $ref, 'created_at' => now(), 'updated_at' => now()];
            }
        }
        foreach (array_chunk($rows, 200) as $chunk) {
            DB::table('skill_xp')->insertOrIgnore($chunk);
        }

        // Gym / diet XP follows the history: delete a workout and its XP goes with it.
        $stale = $have->filter(fn ($id, $ref) => ! isset($wanted[$ref]) && preg_match('/^(g|gp|d):/', $ref))->values();
        if ($stale->isNotEmpty()) {
            SkillXp::whereIn('id', $stale)->delete();
        }

        $after = $this->levels($user);
        $ups = [];
        foreach ($skills as $slug => $skill) {
            $b = $before[$skill->id] ?? 1;
            $a = $after[$skill->id] ?? 1;
            if ($a > $b) {
                $ups[] = ['skill' => $slug, 'name' => $skill->name, 'icon' => $skill->icon, 'level' => $a];
            }
        }

        return $ups;
    }

    /** @return array<int, array> every skill with its level, XP and progress */
    public function overview(User $user): array
    {
        $totals = SkillXp::where('user_id', $user->id)->selectRaw('skill_id, SUM(amount) as xp')->groupBy('skill_id')->pluck('xp', 'skill_id');

        return Skill::orderBy('sort')->get()->map(fn (Skill $s) => [
            'id' => $s->id,
            'slug' => $s->slug,
            'name' => $s->name,
            'description' => $s->description,
            'icon' => $s->icon,
        ] + SkillCurve::summary((int) ($totals[$s->id] ?? 0)))->all();
    }

    public function totalLevel(array $overview): int
    {
        return (int) collect($overview)->sum('level');
    }

    /** @return array<int, int> skill id => level */
    private function levels(User $user): array
    {
        return SkillXp::where('user_id', $user->id)->selectRaw('skill_id, SUM(amount) as xp')->groupBy('skill_id')->pluck('xp', 'skill_id')
            ->map(fn ($xp) => SkillCurve::levelForXp((int) $xp))->all();
    }

    /** @return array<string, array{skill_id: int, amount: int, source: string, date: string}> */
    private function wanted(User $user, $skills): array
    {
        $wanted = [];
        $discipline = $skills['discipline']->id;

        $completions = TaskCompletion::where('task_completions.user_id', $user->id)
            ->join('tasks', 'tasks.id', '=', 'task_completions.task_id')
            ->get(['task_completions.id', 'task_completions.xp', 'task_completions.date', 'tasks.skill_id']);
        foreach ($completions as $c) {
            $wanted["q:{$c->id}"] = ['skill_id' => $c->skill_id ?: $discipline, 'amount' => (int) $c->xp, 'source' => 'quest', 'date' => $c->date->toDateString()];
        }

        $strength = $skills['strength']->id;
        $logs = ExerciseLog::where('user_id', $user->id)->orderBy('date')->orderBy('id')->get(['id', 'exercise_id', 'date', 'weight']);
        foreach ($logs->groupBy(fn ($l) => $l->date->toDateString()) as $date => $_) {
            $wanted["g:{$date}"] = ['skill_id' => $strength, 'amount' => self::GYM_DAY_XP, 'source' => 'gym', 'date' => $date];
        }
        foreach ($logs->groupBy('exercise_id') as $exerciseLogs) {
            $best = null;
            foreach ($exerciseLogs as $l) {
                if ($best !== null && $l->weight > $best) {
                    $wanted["gp:{$l->id}"] = ['skill_id' => $strength, 'amount' => self::GYM_RECORD_XP, 'source' => 'gym', 'date' => $l->date->toDateString()];
                }
                $best = max($best ?? $l->weight, $l->weight);
            }
        }

        $stamina = $skills['stamina']->id;
        foreach (DietRules::perDay($user) as $date => $day) {
            if ($day['ok']) {
                $wanted["d:{$date}"] = ['skill_id' => $stamina, 'amount' => self::DIET_DAY_XP, 'source' => 'diet', 'date' => $date];
            }
        }

        return $wanted;
    }
}
