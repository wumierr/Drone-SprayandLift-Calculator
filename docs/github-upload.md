# 📦 GitHub 上传指引

## 一、准备 GitHub 账号

1. 访问 https://github.com 注册账号（已有可跳过）
2. 安装 Git：
   - Win10 下载：https://git-scm.com/download/win
   - 安装时一路默认即可
   - 安装完成后在桌面右键应能看到 "Git Bash Here" 选项

## 二、配置 Git（首次使用）

打开 Git Bash 或 CMD，执行：
```bash
git config --global user.name "你的名字"
git config --global user.email "你的邮箱@example.com"
```

## 三、在 GitHub 创建仓库

1. 登录 GitHub，点击右上角 **+** → **New repository**
2. 填写：
   - Repository name: `drone-spray-calculator`
   - Description: `无人机打药药量/水量/成本/利润计算器`
   - 选择 **Public**（公开）或 **Private**（私有）
   - **不要**勾选 "Add a README" / "Add .gitignore" / "Choose a license"（项目已自带）
3. 点击 **Create repository**

## 四、上传项目

### 方式 A：使用 Git 命令行（推荐）

```bash
# 1. 进入项目目录
cd /path/to/drone-spray-calculator

# 2. 初始化 git 仓库
git init
git branch -M main

# 3. 添加所有文件
git add .

# 4. 首次提交
git commit -m "feat: 无人机打药计算器 v1.0"

# 5. 关联远程仓库（替换 <你的用户名>）
git remote add origin https://github.com/<你的用户名>/drone-spray-calculator.git

# 6. 推送
git push -u origin main
```

首次推送时会弹出 GitHub 登录窗口，按提示授权即可。

### 方式 B：使用 GitHub Desktop（图形界面，更适合新手）

1. 下载安装：https://desktop.github.com/
2. 打开后登录 GitHub 账号
3. 点击 **File → Add local repository**
4. 选择项目文件夹
5. 点击 **Publish repository**
6. 选择公开/私有，点击 **Publish**

### 方式 C：直接网页拖拽上传

1. 进入你的 GitHub 仓库页面
2. 点击 **uploading an existing file** 链接
3. 把项目所有文件拖入页面
4. 填写 commit message，点击 **Commit changes**

> ⚠️ 方式 C 不便于后续更新，仅推荐首次上传使用。

## 五、开启 GitHub Pages（免费在线访问）

1. 进入仓库 → **Settings** → 左侧 **Pages**
2. **Source** 选择 **Deploy from a branch**
3. **Branch** 选择 `main`，文件夹选择 `/ (root)`
4. 点击 **Save**
5. 等待 1-2 分钟，刷新页面会显示访问地址：
   ```
   https://<你的用户名>.github.io/drone-spray-calculator/
   ```

## 六、后续更新

修改文件后，再次提交并推送：
```bash
git add .
git commit -m "update: 修改说明"
git push
```

GitHub Pages 会自动更新。

## 七、克隆到其他设备

```bash
git clone https://github.com/<你的用户名>/drone-spray-calculator.git
cd drone-spray-calculator
# 双击 index.html 即可使用
```

## 八、常见问题

### Q: 推送时报错 "Permission denied"
A: 检查 GitHub 登录凭据，或使用 SSH key：
```bash
ssh-keygen -t ed25519 -C "你的邮箱"
# 一路回车
cat ~/.ssh/id_ed25519.pub
# 把输出复制到 GitHub → Settings → SSH and GPG keys → New SSH key
```

### Q: 推送时报错 "rejected - non-fast-forward"
A: 远程有更新，先拉取：
```bash
git pull --rebase origin main
git push
```

### Q: GitHub Pages 打不开
A: 检查仓库名是否与 URL 一致；公开仓库才能用免费的 Pages。

### Q: 想换自定义域名
A: 在仓库根目录添加 `CNAME` 文件，写入你的域名，并在 DNS 服务商添加 CNAME 记录指向 `<你的用户名>.github.io`。
