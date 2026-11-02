#!/usr/bin/env bash
set -euo pipefail

output_dir="${1:-$HOME/.config/emacs30-lan-ca}"
hostname="${2:-tldraw.emacs30.lan}"
address="${3:-10.0.5.40}"
ca_key="$output_dir/rootCA.key"
ca_cert="$output_dir/rootCA.crt"
server_key="$output_dir/$hostname.key"
server_cert="$output_dir/$hostname.crt"

umask 077
mkdir -p "$output_dir"

if [[ -e "$ca_key" || -e "$ca_cert" ]]; then
	[[ -f "$ca_key" && -f "$ca_cert" ]] || {
		printf 'Incomplete CA files in %s; refusing to overwrite them.\n' "$output_dir" >&2
		exit 1
	}
else
	openssl req -x509 -newkey rsa:3072 -sha256 -days 3650 -nodes \
		-keyout "$ca_key" -out "$ca_cert" \
		-subj '/CN=Emacs30 LAN Root CA' \
		-addext 'basicConstraints=critical,CA:true' \
		-addext 'keyUsage=critical,keyCertSign,cRLSign' \
		-addext 'subjectKeyIdentifier=hash'
fi

if [[ -e "$server_key" || -e "$server_cert" ]]; then
	printf 'Server certificate already exists in %s; refusing to overwrite it.\n' "$output_dir" >&2
	exit 1
fi

cat > "$output_dir/$hostname.extensions.cnf" <<EOF
basicConstraints=critical,CA:false
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectKeyIdentifier=hash
authorityKeyIdentifier=keyid,issuer
subjectAltName=DNS:$hostname,IP:$address
EOF

openssl req -new -newkey rsa:2048 -sha256 -nodes \
	-keyout "$server_key" -out "$output_dir/$hostname.csr" \
	-subj "/CN=$hostname" \
	-addext "subjectAltName=DNS:$hostname,IP:$address"
openssl x509 -req -sha256 -days 825 \
	-in "$output_dir/$hostname.csr" \
	-CA "$ca_cert" -CAkey "$ca_key" -CAcreateserial \
	-out "$server_cert" \
	-extfile "$output_dir/$hostname.extensions.cnf"

chmod 600 "$ca_key" "$server_key"
chmod 644 "$ca_cert" "$server_cert"
printf 'CA certificate: %s\nServer certificate: %s\nServer private key: %s (contents not shown)\n' \
	"$ca_cert" "$server_cert" "$server_key"
