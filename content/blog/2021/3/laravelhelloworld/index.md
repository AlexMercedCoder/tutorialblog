---
title: Hello World - Laravel 101 (From Start to Deploy)
date: "2021-03-03T12:12:03.284Z"
description: Tales of PHP's Demise are Exaggerated
---

PHP has come a long way from the PHP 3 days. You may run into people who criticize PHP based on those days when security and speed critiques were legitimate but a lot has changed from PHP 3 to today's PHP 8.

- Huge speed improvements ( 50% from 3 -> 5, 129% 5 -> 7 based on WordPress speed)
- A lot of security improvements
- modern syntax like arrow functions and spread operator

On top of the improvements in the language itself, new frameworks like Laravel and package managers like Composer offer developers a modern development experience that can easily rival Ruby on Rails or Python Django.

The point being, PHP is still widely popular because of the popularity of WordPress but has involved in its own right and is ripe to capture further market share in modern application development.

## Getting Started

Make sure the following are installed:

- PHP 7.4.9 or above
- composer (getcomposer.org)
- have a Heroku account
- Postgres server running (you can read Laravels docs for other databases)

Once all the above is taken care of, open up your terminal in a directory you'd like to work out of and run the following command.

```
composer create-project laravel/laravel example-app

```

then change into the new project directory that has been created.

## Chart of Commands

| Command                                    | Purpose                                  |
| ------------------------------------------ | ---------------------------------------- |
| php artisan serve                          | start development server                 |
| php artisan db                             | enter database console                   |
| php artisan make:migration migrationName   | create a new migration                   |
| php artisan migrate                        | run migrations                           |
| php artisan migrate:rollback               | rollback last migration                  |
| php artisan migrate:reset                  | rollback all migrations                  |
| php artisan migrate:refresh                | rollbacks all migrations then remigrates |
| php artisan make:seeder                    | make a seed file                         |
| php artisan db:seed                        | run your seed files                      |
| php artisan make:model ModelName           | make a new model                         |
| php artisan make:controller ControllerName | make a new controller                    |

## Configuring Your New Project

Let's configure our database, all of these settings will be in the local environmental variables in the .env file.
**keep in mind, you may have to uncomment out Postgres drivers in the php.ini file for your PHP install**

```
DB_CONNECTION=pgsql
DB_HOST=localhost
DB_PORT=5432
DB_DATABASE=laravel
DB_USERNAME=test5
DB_PASSWORD=test5
```

**make sure to create the database with the command `createdb databaseName`**

Confirm by connecting to your database shell with the command `php artisan db`

## Creating our first migration

Migrations are how we add, adjust and remove tables from our database in a way we can easily replicate later when we deploy. So anytime we want to update the structure of our database we need to generate a new migration that will hold the directions for the changes.

Like Rails, Laravel will use the name of the migration to attempt to pre-populate the migration with what you need.

`php artisan make:migration create_todos_table`

if you go to /database/migrations/ you'll notice some default migrations we can use for reference and our new migration.

Since create_todos_table was the name of the migration it knew we wanted to create a new table called todos, magic!

```php
        Schema::create('todos', function (Blueprint $table) {
            $table->id();
            $table->timestamps();
        });
```

In this function we can define any additional fields the table should have, read the Eloquent ORM section of the Laravel documentation to learn about the different data types, we'll just add a string field for our todos.

```php
        Schema::create('todos', function (Blueprint $table) {
            $table->id();
            $table->string('item');
            $table->timestamps();
        });
```

We can now run our migrations with the command `php artisan migrate`

## Seed Some Data

Let's create a seed with the command `php artisan make:seeder TodoSeeder`.

You should find a file called TodoSeeder in /database/seeders/ with a run function which is what defines our database transactions.

```php
    public function run()
    {
        //
    }
```

Let's add a few todos!

```php
<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class TodoSeeder extends Seeder
{
    /**
     * Run the database seeds.
     *
     * @return void
     */
    public function run()
    {
        DB::table('todos')->insert([
            'item' => "Breakfast",
        ]);

        DB::table('todos')->insert([
            'item' => "Lunch",
        ]);

        DB::table('todos')->insert([
            'item' => "Dinner",
        ]);
    }
}
```

Then let's run our seed with the command `php artisan db:seed` which will by default run DatabaseSeeder which doesn't help us. We need to edit DatabaseSeeder so it runs our new seed class.

```php
<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Database\Seeders\TodoSeeder;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     *
     * @return void
     */
    public function run()
    {
        $this->call([TodoSeeder::class]);
    }
}
```

Run the seed command and we should be back in action!

## Creating a Model

Now we want to create a model class to take advantage of Eloquent ORM. The model class will allow us to interact with the todos table with ease.

`php artisan make:model Todo`

A new Todo.php file should exist in /app/models/

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Todo extends Model
{
    use HasFactory;
}
```

That's it, should work long at the table name is the plural version of the class name. So the todo model will automatically use a todos table in our database.

If for some reason the database name doesn't fit the convention or isn't connecting properly you can explicitly define the table.

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Todo extends Model
{
    use HasFactory;
    protected $table = 'todos';
}
```

## Creating A Controller

A Controller is a class that will group together several "action" functions. These actions will be triggered by routes we will later specify and will determine what response our server will send back.

Create a new controller with the command `php artisan make:controller TodoController`

You will see a new controller created in /app/http/controllers/

```php
<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;

class TodoController extends Controller
{
    //
}
```

So let's import our model and create an index action that returns all of our todos.

```php

<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Todo;

class TodoController extends Controller
{
    public function index () {
        // Response function allows us to send response
        return response(Todo::all(), 200)
        ->header('Content-Type', 'application/json');
    }
}

```

## Creating Our Route

Since we are building an api we will use the pre-made api route group in /routes/api.php. We will import our Controller class and write our route.

```php
<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\TodoController;

Route::get("/todo", [TodoController::class, 'index']);
```

Run the dev server and you should be able to see all your Todos at /api/todo/

## Using Params

Let's create a show route before we deploy to get some more practice. The routine going forward is always the same.

- Create a new controller action
- Link Controller action to a New Route

### New Controller Action

Now we will add a function called show to our controller that expects to be passed an id.

```php
<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Todo;

class TodoController extends Controller
{
    public function index () {
        // Response function allows us to send response
        return response(Todo::all(), 200)
        ->header('Content-Type', 'application/json');
    }

    public function show($id){
        return response(Todo::findOrFail($id), 200)
        ->header('Content-Type', 'application/json');
    }
}
```

### Link new action to route

Let's update our api routes

```php
<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\TodoController;

Route::get("/todo", [TodoController::class, 'index']);
Route::get("/todo/{id}", [TodoController::class, 'show']);
```

The following routes should now all work

- /todo/1
- /todo/2
- /todo/3

## Heroku Deployment

Step 1 - create a file called "Procfile" in the root of your project with the following:

```
web: vendor/bin/heroku-php-apache2 public/
```

Step 2 - Create a repository in the project root (the same folder with the Procfile and composer.json) and push your code up to github.

Step 3 - Create a new project on Heroku and link it to your repo

Step 4 - turn on automatic deploys and trigger a manual deploy

Step 5 - head over to the resources section of heroku and make sure to provision a postgres database if one wasn't already created.

Step 6 - Then make sure to head over to settings in the project to set the following config vars, for the database you can find all the credentials in the database settings which you can get access to from the resources tab.

- APP_KEY: use the one from your local .env or generate a new one by running this command locally `php artisan key:generate --show`

- APP_ENV: "production"

- DB_CONNECTION: "pgsql"

- DB_HOST: get this from the database settings on heroku (under resources)

- DB_USERNAME: get this from the database settings on heroku (under resources)

- DB_PASSWORD: get this from the database settings on heroku (under resources)

- DB_PORT: get this from the database settings on heroku (under resources)

- DB_DATABASE: get this from the database settings on heroku (under resources)

After that is done you can run the following commands using the heroku cli or the run console option under more (next to open app).

- heroku run php artisan migrate
- heroku run php artisan db:seed

Your app is up and working, congrats!!!