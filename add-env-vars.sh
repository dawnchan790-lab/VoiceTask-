#!/bin/bash

# Cloudflare Pages 環境変数追加スクリプト
# プロジェクト名: voicetask

echo "========================================="
echo "Cloudflare Pages 環境変数を追加します"
echo "========================================="
echo ""
echo "このスクリプトは、以下の9個の環境変数を追加します："
echo ""
echo "1. VITE_GOOGLE_CLIENT_ID"
echo "2. VITE_GOOGLE_API_KEY"
echo "3. VITE_FIREBASE_API_KEY"
echo "4. VITE_FIREBASE_AUTH_DOMAIN"
echo "5. VITE_FIREBASE_PROJECT_ID"
echo "6. VITE_FIREBASE_STORAGE_BUCKET"
echo "7. VITE_FIREBASE_MESSAGING_SENDER_ID"
echo "8. VITE_FIREBASE_APP_ID"
echo "9. VITE_FIREBASE_MEASUREMENT_ID"
echo ""
echo "========================================="
echo ""

# Cloudflare API トークンを要求
read -sp "Cloudflare API Token を入力してください: " CLOUDFLARE_API_TOKEN
echo ""
echo ""

export CLOUDFLARE_API_TOKEN

# プロジェクト名
PROJECT_NAME="voicetask"

# 環境変数の配列
declare -A env_vars=(
  ["VITE_GOOGLE_CLIENT_ID"]="124599985897-pff38ou97hi82d72svr5l7ltp84n67a9.apps.googleusercontent.com"
  ["VITE_GOOGLE_API_KEY"]="AIzaSyBM2uC2-z0ByKGG2fhLvVkulCpty3B35r4"
  ["VITE_FIREBASE_API_KEY"]="AIzaSvBJaPZB06Vlt6HCvKtdepRX4SRJRSLcX6k"
  ["VITE_FIREBASE_AUTH_DOMAIN"]="voicetask-31b14.firebaseapp.com"
  ["VITE_FIREBASE_PROJECT_ID"]="voicetask-31b14"
  ["VITE_FIREBASE_STORAGE_BUCKET"]="voicetask-31b14.firebasestorage.app"
  ["VITE_FIREBASE_MESSAGING_SENDER_ID"]="98512140792"
  ["VITE_FIREBASE_APP_ID"]="1:98512140792:web:5238dc482683492a261c6"
  ["VITE_FIREBASE_MEASUREMENT_ID"]="G-38T3C9TS9K"
)

# 各環境変数を追加
counter=1
total=${#env_vars[@]}

for key in "${!env_vars[@]}"; do
  value="${env_vars[$key]}"
  echo "[$counter/$total] 追加中: $key"
  
  echo "$value" | npx wrangler pages secret put "$key" --project-name "$PROJECT_NAME"
  
  if [ $? -eq 0 ]; then
    echo "✅ $key を追加しました"
  else
    echo "❌ $key の追加に失敗しました"
  fi
  
  echo ""
  counter=$((counter + 1))
done

echo "========================================="
echo "✅ 環境変数の追加が完了しました！"
echo "========================================="
echo ""
echo "次のステップ："
echo "1. Deployments タブで再デプロイを実行"
echo "2. https://voicetask.pages.dev にアクセスして動作確認"
echo ""
