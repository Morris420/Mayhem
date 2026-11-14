<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        // Pretend to be the Vue dev server so Sanctum treats us as a stateful SPA.
        $this->withHeaders(['Origin' => 'http://localhost:5173', 'Accept' => 'application/json']);
    }

    public function test_user_can_register_without_email_and_is_logged_in(): void
    {
        $this->postJson('/api/register', [
            'username' => 'sung_jinwoo',
            'password' => 'secret123',
            'password_confirmation' => 'secret123',
        ])->assertCreated()->assertJsonPath('data.username', 'sung_jinwoo')
            ->assertJsonPath('data.rank', 'E')->assertJsonPath('data.level', 1);

        // Simulate the *next* browser request (a fresh process re-reads the user).
        $this->app['auth']->forgetGuards();
        $this->getJson('/api/user')->assertOk()->assertJsonPath('data.username', 'sung_jinwoo');
    }

    public function test_register_rejects_duplicate_username_and_mismatched_password(): void
    {
        User::factory()->create(['username' => 'taken']);

        $this->postJson('/api/register', ['username' => 'taken', 'password' => 'secret123', 'password_confirmation' => 'secret123'])
            ->assertUnprocessable()->assertJsonValidationErrors('username');

        $this->postJson('/api/register', ['username' => 'fresh', 'password' => 'secret123', 'password_confirmation' => 'nope'])
            ->assertUnprocessable()->assertJsonValidationErrors('password');
    }

    public function test_login_and_logout(): void
    {
        User::factory()->create(['username' => 'hunter', 'password' => 'secret123']);

        $this->postJson('/api/login', ['username' => 'hunter', 'password' => 'wrong'])
            ->assertUnprocessable()->assertJsonValidationErrors('username');

        $this->postJson('/api/login', ['username' => 'hunter', 'password' => 'secret123'])
            ->assertOk()->assertJsonPath('data.username', 'hunter');

        $this->getJson('/api/user')->assertOk();
        $this->postJson('/api/logout')->assertOk();

        // The session guard keeps the user in memory within a single test request
        // cycle, so reset it to see what a *new* request would see.
        $this->app['auth']->forgetGuards();
        $this->getJson('/api/user')->assertUnauthorized();
    }

    public function test_protected_routes_require_login(): void
    {
        $this->getJson('/api/dashboard')->assertUnauthorized();
        $this->getJson('/api/tasks')->assertUnauthorized();
    }
}
