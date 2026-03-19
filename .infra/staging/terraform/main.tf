terraform {
  required_providers {
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "~> 2.0"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
    local = {
      source  = "hashicorp/local"
      version = "~> 2.0"
    }
  }
}

provider "digitalocean" {
  token = var.do_token
}

locals {
  config = yamldecode(file("${path.module}/../config.yml"))
}

# Generate SSH key pair
resource "tls_private_key" "staging" {
  algorithm = "ED25519"
}

# Save private key locally
resource "local_file" "ssh_private_key" {
  content         = tls_private_key.staging.private_key_openssh
  filename        = "${path.module}/../staging_key"
  file_permission = "0600"
}

# Save public key locally
resource "local_file" "ssh_public_key" {
  content         = tls_private_key.staging.public_key_openssh
  filename        = "${path.module}/../staging_key.pub"
  file_permission = "0644"
}

# Register SSH key with DigitalOcean
resource "digitalocean_ssh_key" "staging" {
  name       = "${local.config.droplet_name}-key"
  public_key = tls_private_key.staging.public_key_openssh
}

# Create the droplet
resource "digitalocean_droplet" "staging" {
  name     = local.config.droplet_name
  region   = local.config.region
  size     = local.config.size
  image    = local.config.image
  ssh_keys = [digitalocean_ssh_key.staging.fingerprint]

  tags = ["staging", "laravel"]
}

# Generate Ansible inventory
resource "local_file" "ansible_inventory" {
  content = templatefile("${path.module}/inventory.tpl", {
    ip          = digitalocean_droplet.staging.ipv4_address
    private_key = "${path.module}/../staging_key"
  })
  filename = "${path.module}/../ansible/inventory.ini"
}
