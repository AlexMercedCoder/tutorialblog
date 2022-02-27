---
title: Understanding SSH and What it is for
date: "2022-27-05T12:12:03.284Z"
description: Logging Securely and Conveniently with SSH
---

## What is SSH

Computers communicating over a network like and intranet or internet use TCP (transmission control protocol), think of this like the post-office which is the standard way to mail from point a to point b. So each computer on a network has an IP address and can send message to each messages to each other using URIs.

URIs follow the following pattern (in the same way our personal home addresses do)

```
protocol://username:password@host:port/path
```

like an internet url

```
https:///www.somewebsite.com/somefile.html
```

or a database uri string

```
postgresql://user:password@127.0.0.1:5432/database_name
```

Although sometimes you are connecting to another computer to give it demands directly instead of through intermediary server like a web server or database server. So the computer will need higher security before allowing any external computer to send it commands to run, and this is where SSH comes in.

SSH (Secure Shell) allows you to connect to a shell session on a remote computer securely using an encrypted key. This is also often used for logging into thing like github.

## How it Works

On the client computer you need to create an SSH key, this is usually done in a hidden .ssh directory.

```bash
# Change to .ssh directory
cd ~/.ssh
# Create an ssh key
ssh-keygen
```

You can just accept all the default options and it should create two files. (default name id_rsa)

```
id_rsa id_rsa.pub
```

the .pub file is the public key, this needs to be shared with the server you are going to connect to, we can get its contents with the following command.

```
cat id_rsa.pub
```

Then you can copy and paste the output to wherever you need (like github.com or onto a virtual server you get from AWS). The other file has your secret key. Now when you try to connect to the server it will see if your computer has the secret key to match on of the public keys that has been shared with it, if so, your in! This can be convenient and secure since there is no need for username or a password (unless you included a passcode on your key) but also makes sure only computers that have the secret key can login (which is why you should never share your private key).
