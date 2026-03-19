output "droplet_ip" {
  description = "Public IP of the staging droplet"
  value       = digitalocean_droplet.staging.ipv4_address
}

output "ssh_command" {
  description = "SSH into the staging server"
  value       = "ssh -i ${path.module}/../staging_key root@${digitalocean_droplet.staging.ipv4_address}"
}

output "next_step" {
  description = "Next step after provisioning"
  value       = "Run: cd ../ansible && ansible-playbook -i inventory.ini playbook.yml --tags stage1"
}
