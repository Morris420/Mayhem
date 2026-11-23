<?php

namespace Database\Seeders;

use App\Models\Achievement;
use Illuminate\Database\Seeder;

class AchievementSeeder extends Seeder
{
    /**
     * The built-in catalog. Entries with a rule unlock automatically from your data
     * (see App\Support\AchievementEngine); the others unlock via quests you link to them.
     * [slug, name, description, icon, tier, rule, threshold]
     */
    public static function catalog(): array
    {
        return [
            // linked to quests
            ['golden-medal', 'Golden Medal: Marathon', 'Run a full marathon (42.2 km).', 'medal', 'S', null, null],
            ['silver-pacer', 'Silver Pacer', 'Run a 10K without stopping.', 'footprints', 'C', null, null],
            ['centurion', 'Centurion', 'Do 100 push-ups in a single day.', 'flame', 'D', null, null],
            ['shadow-discipline', 'Shadow Discipline', 'Wake up before 06:00 for a full week.', 'sunrise', 'B', null, null],
            ['deep-focus', 'Deep Focus', 'Complete 4 hours of distraction-free deep work.', 'brain', 'C', null, null],
            ['scholars-seal', "Scholar's Seal", 'Finish a book or an online course.', 'book', 'C', null, null],

            // automatic: gym
            ['first-rep', 'First Rep', 'Log your first workout.', 'dumbbell', 'E', 'gym_sessions', 1],
            ['creature-of-habit', 'Creature of Habit', 'Log 10 workouts.', 'flame', 'D', 'gym_sessions', 10],
            ['iron-body', 'Iron Body', 'Beat your own best on a lift.', 'dumbbell', 'C', 'gym_records', 1],
            ['five-a-week', 'Five-a-Week', 'Train on 5 different days in one week.', 'zap', 'B', 'gym_week_days', 5],
            ['record-breaker', 'Record Breaker', 'Beat your own best 10 times.', 'trophy', 'B', 'gym_records', 10],
            ['forged-in-iron', 'Forged in Iron', 'Log 50 workouts.', 'medal', 'A', 'gym_sessions', 50],

            // automatic: diet
            ['on-target', 'On Target', 'Hit both your calorie and protein goals in one day.', 'target', 'E', 'diet_days_ok', 1],
            ['iron-chef', 'Iron Chef', 'Hit both nutrition goals 7 days in a row.', 'utensils', 'A', 'diet_streak', 7],
            ['protein-pro', 'Protein Pro', 'Hit both nutrition goals on 30 days in total.', 'utensils', 'B', 'diet_days_ok', 30],
            ['unbroken-fuel', 'Unbroken Fuel', 'Hit both nutrition goals 30 days in a row.', 'flame', 'S', 'diet_streak', 30],
        ];
    }

    public function run(): void
    {
        foreach (self::catalog() as [$slug, $name, $description, $icon, $tier, $rule, $threshold]) {
            // updateOrCreate keeps the seeder safe to re-run.
            Achievement::updateOrCreate(
                ['slug' => $slug],
                compact('name', 'description', 'icon', 'tier', 'rule', 'threshold')
            );
        }
    }
}
