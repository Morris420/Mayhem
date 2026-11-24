<?php

namespace Database\Seeders;

use App\Models\Skill;
use Illuminate\Database\Seeder;

class SkillSeeder extends Seeder
{
    /** [slug, name, description, icon] in the order they are shown. */
    public static function catalog(): array
    {
        return [
            ['strength', 'Strength', 'Lifting and raw power.', 'dumbbell'],
            ['stamina', 'Stamina', 'Cardio, endurance and eating well.', 'activity'],
            ['discipline', 'Discipline', 'Habits, routines and keeping your word.', 'target'],
            ['intellect', 'Intellect', 'Deep study, philosophy and learning.', 'brain'],
            ['literacy', 'Literacy', 'Reading and writing.', 'book'],
            ['faith', 'Faith', 'Meditation, gratitude and spiritual practice.', 'sunrise'],
            ['affection', 'Affection', 'Family, friends and acts of kindness.', 'heart'],
            ['fortune', 'Fortune', 'Money: tracking, saving and building.', 'coins'],
            ['craft', 'Craft', 'Building things: projects, career, skills.', 'hammer'],
        ];
    }

    public function run(): void
    {
        foreach (self::catalog() as $i => [$slug, $name, $description, $icon]) {
            Skill::updateOrCreate(['slug' => $slug], compact('name', 'description', 'icon') + ['sort' => $i]);
        }
    }
}
