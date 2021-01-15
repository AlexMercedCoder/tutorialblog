---
title: Intro to PHP
date: "2021-01-15T12:12:03.284Z"
description: Learn the Pre-Hypertext Processor Language
---

## What is PHP?

PHP is a language that was originally created for server-side code for web applications. One of the coolest parts of PHP is that it was a full programming language and templating tool in one making it a lot of fun to work with for web apps which is why many of the most popular platforms like WordPress and Drupal are created using PHP. WordPress websites make up around 50% of websites on the web so knowing PHP to assist WordPress uses with custom themes and plug-ins is a very marketable skill.

On top of that the PHP language has changed a bit with it's latest versions (I'm running PHP 7.9 as I write this article), now can be run from the command line like a scripting language, has a robust package management tool with Composer, and a really popular and robust web framework in Laravel for creating web servers.

The tales of PHP's demise are greatly exaggerated and there has never been a better time to learn PHP.

## Setup

Ideally, for this tutorial, I'll be incorporating new PHP features so updating to or installing PHP 7.9 or above would be useful. To test whether the PHP CLI is installed on your computer run the following command in the terminal.

```
php --version
```

You should get output like this if the PHP CLI is installed

```
PHP 7.4.9 (cli) (built: Oct 26 2020 15:17:14) ( NTS )
Copyright (c) The PHP Group
Zend Engine v3.4.0, Copyright (c) Zend Technologies
    with Zend OPcache v7.4.9, Copyright (c), by Zend Technologies
```

- [Install PHP on MAC](https://chasingcode.dev/blog/upgrade-php-74-cli-mac/)
- [Install PHP on Windows](https://php.tutorials24x7.com/blog/how-to-install-php-7-on-windows)
- [Install PHP on Ubuntu 20.04](https://linuxize.com/post/how-to-install-php-8-on-ubuntu-20-04/)

**Note if you don't want to install PHP right now you can create a REPL with PHP 7.2 on the website REPL.it to try it out online as of the writing of this article**

## Your First PHP File

in an empty folder create an index.php file.

index.php

```php
<?php

echo "hello \n";

?>
```

- run the file with the command ```php index.php```

Things to notice:

- The usage of php must exist in ```<?php |PHP CODE| ?>```
- each command must end with a semi-colon
- echo will be our printing command to print text to console

## Declaring variables, array and associative arrays

update index.php

**refer to comments in code for an explanation of code**

```php

<?php

// VARIABLES MUST BE DECLARED WITH $prefix
$myVar = 5;
echo($myVar."\n"); //Notice concatenation is done with a . not a +

// Arrays are declared with []
$myArr = [1,2,3,4,5,6];
echo($myArr[2]."\n");
var_dump($myArr); //var dump is for dumping/printing complex data structures that can't be turned to strings by echo

// Key value pairs are associative arrays also using []
$myAssoc = ["name" => "Alex", "age" => 35];
echo("$myAssoc[name] \n"); //I can refer to variables by their name with no extra syntax to use interpolation
var_dump($myAssoc)


?>

```

## PHP For Templating

PHP was originally made for templating so let's show you how that works!

update index.php
**read comments for explanation of code**

```php
<?php
// Inside the <?php |CODE| is treated as PHP, outside is treated as HTML
$title = "This is my title";
$heading = "This is my Heading"
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <!-- USING ECHO I CAN INJECT PHP VARIABLES INTO MY HTML -->
    <title><?php echo($title); ?></title>
</head>
<body>

    <h1><?php echo($heading); ?></h1>
    
</body>
</html>
```

- To run a PHP server to process this into a finalized HTML file, run the following command ```php -S localhost:5000``` this command runs a PHP web server out of the current directory

- open your browser to localhost:5000 and you'll see our rendered page!

## Conclusion

PHP can do so much more but this hopefully gives you a taste for its flexibility. I have videos where I cover more below.

- [MY PHP VIDEO PLAYLIST](https://www.youtube.com/playlist?list=PLY6oTPmKnKbbLnwRkrCDhOl94iaibHwBJ)