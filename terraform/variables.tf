variable "aws_region" {
  description = "AWS region"
  default     = "us-east-1"
}

variable "key_pair_name" {
  description = "Name of AWS key pair"
  type        = string
}
