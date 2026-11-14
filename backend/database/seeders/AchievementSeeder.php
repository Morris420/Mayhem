<?php

namespace Database\Seeders;

use App\Models\Achievement;
use Illuminate\Database\Seeder;

class AchievementSeeder extends Seeder
{
    public function run(): void
    {
        $catalog = [
            ['golden-medal', 'Golden Medal: Marathon', 'Run a full marathon (42.2 km).', 'medal', 'S'],
            ['silver-pacer', 'Silver Pacer', 'Run a 10K without stopping.', 'footprints', 'C'],
            ['iron-body', 'Iron Body', 'Hit a new personal record on a main lift.', 'dumbbell', 'B'],
            ['centurion', 'Centurion', 'Do 100 push-ups in a single day.', 'flame', 'D'],
            ['shadow-discipline', 'Shadow Discipline', 'Wake up before 06:00 for a full week.', 'sunrise', 'B'],
            ['deep-focus', 'Deep Focus', 'Complete 4 hours of distraction-free deep work.', 'brain', 'C'],
            ['scholars-seal', "Scholar's Seal", 'Finish a book or an online course.', 'book', 'C'],
            ['iron-chef', 'Iron Chef', 'Meal-prep and hit your macros for a full week.', 'utensils', 'A'],
        ];

        foreach ($catalog as [$slug, $name, $description, $icon, $tier]) {
            // updateOrCreate keeps the seeder safe to re-run.
            Achievement::updateOrCreate(
                ['slug' => $slug],
                compact('name', 'description', 'icon', 'tier')
            );
        }
    }
}
