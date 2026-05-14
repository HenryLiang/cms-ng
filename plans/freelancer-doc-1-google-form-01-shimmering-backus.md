# Freelancer 薪资计算与结算自动化程序 - 实现计划

## Context

每月 freelancer 薪金结算耗费大量人工时间，需要从 Google Form 考勤数据中手动提取、计算、制表，再逐份 copy & paste 制作个人付款申请表和总额审批单。本程序旨在实现"一键抓取数据并按规则算钱 → 批量生成个人请款单 → 生成最终汇总审批单"的全流程自动化。

## 输入数据

### 1. Google Form 考勤数据
`docs/01 Education New Helper（Content Creator and Event Ambassador） — Working Time Sheet (回覆).xlsx`

- **Content Creator** sheet (244 rows): 时间戳记, confirm, 总薪酬, 电邮, 英文姓名, 自由工作者编号, 工作日期, 开始时间, 结束时间, 工作总时长, lunch time, 工作内容, 工作计划, 问题, 收款名称, 银行名称, 银行账号
- **Event Ambassador** sheet (286 rows): 时间戳记, Confirm, Event Code, 电邮, 英文姓名, Freelance Number, 职位, 工作日期, 开始时间, 结束时间, 工作总时长, 交通津贴, lunch time, 工作内容, 文件检查, 问题, 电话, 收款名称, 银行名称, 银行账号

### 2. HR Freelancer 数据库
`docs/Copy- HR_自由工作者申請Excel.xlsx`

- **工作表1**: 完整自由工作者信息（姓名、英文姓名、身份证、电邮、电话、银行名称、银行户口号码、合作开始日、工作范围、薪金结算方法等）
- **From OTD**: 自由工作者编号映射表（Freelancer code, 姓名, 英文姓名, Gmail）

## 输出产物

### Step 1: 当月人员薪酬总表（Excel）
汇总所有已确认（confirm="Yes"）的考勤记录，按人分组计算总薪酬。

### Step 2: 个人付款申请表（Excel + PDF）
为每位 freelancer 单独生成一份付款申请表。

### Step 3: 总额付款申请表（Excel + PDF）
汇总所有个人申请表，生成一份总额审批单供管理层签字。

## 薪资计算规则

| 角色 | 计算方式 |
|------|---------|
| Content Creator | $75 HKD/小时 × 工作总时长 |
| Event Ambassador 活動助理 | $75 HKD/小时 × 工作总时长；若工作时长 ≤ 2小时，追加 $30 HKD 交通津贴 |
| Master 導師 | $800 HKD/场（按 event 场次计） |
| Head Master 首席導師 | $1000 HKD/场（按 event 场次计） |

**注意**: 只处理 `confirm` / `Confirm` = "Yes" 的记录。

## 实现方案

### 项目结构

```
freelancer_payment_auto/
├── config.yaml              # 活动信息、申请人信息、固定字段配置
├── main.py                  # 主入口脚本
├── requirements.txt         # Python依赖
├── src/
│   ├── __init__.py
│   ├── data_loader.py       # 读取 Excel 数据
│   ├── salary_calculator.py # 薪资计算逻辑
│   ├── hr_matcher.py        # HR 数据库匹配
│   ├── summary_sheet.py     # 生成薪酬总表（Excel）
│   ├── individual_form.py   # 生成个人付款申请表（Excel + PDF）
│   ├── total_form.py        # 生成总额付款申请表（Excel + PDF）
│   └── pdf_generator.py     # PDF 生成工具（基于 reportlab）
├── output/                  # 输出目录
│   ├── YYYY-MM/
│   │   ├── summary_sheet.xlsx
│   │   ├── individual_forms/
│   │   │   ├── 付款申請表_{姓名}_{金额}.xlsx
│   │   │   └── 付款申請表_{姓名}_{金额}.pdf
│   │   └── total_form.xlsx
│   │   └── total_form.pdf
└── templates/               # PDF 模板或样式配置
    └── form_template.json   # 表单字段位置配置
```

### 技术选型

- **数据处理**: `pandas` + `openpyxl`
- **Excel 生成**: `openpyxl`（支持样式、公式）
- **PDF 生成**: `reportlab`（灵活绘制，可精确控制布局）

### 核心模块设计

#### 1. data_loader.py
- 读取 Google Form 考勤 Excel
- 读取 HR 数据库 Excel
- 数据清洗（去空行、标准化姓名、处理日期格式）

#### 2. hr_matcher.py
- 通过姓名/邮箱匹配 HR 数据库
- 提取：自由工作者编号、收款名称、银行名称、银行账号
- 处理姓名变体（如大小写、空格差异）

#### 3. salary_calculator.py
- Content Creator: 75 × 工作总时长
- Event Ambassador 活動助理: 75 × 工作总时长 + (时长 ≤ 2 ? 30 : 0)
- Master: 800/场
- Head Master: 1000/场
- 返回每个人当月总薪酬及明细

#### 4. summary_sheet.py
- 生成当月薪酬总表 Excel
- 包含：姓名、自由工作者编号、角色、工作天数、总工作时长、总薪酬、银行信息
- 按人汇总，按角色分组

#### 5. individual_form.py
- 基于配置信息和薪酬数据生成个人申请表
- Excel 版本：模拟现有 PDF 的表格结构
- PDF 版本：使用 reportlab 绘制相同布局

#### 6. total_form.py
- 汇总所有个人申请表
- 生成总额审批单

### 配置文件 config.yaml

```yaml
# 活动信息
project:
  name: "P25002"
  location: "我的行動承諾加強版"
  date_range: "Mar - Apr 2026"

# 申请人信息
applicant:
  name: "Martini Wong"
  phone: "9337 4612"
  department: "BST"

# 公司信息
company:
  name: "HK01 Co Ltd"
  applicant_dept: "BST"
  cost_dept: "BST"

# 审批人信息
approver:
  dept_manager: "Andrea SO"

# 固定字段
fixed:
  payment_method: "電子轉賬"
  currency: "HKD"
  form_number: "ACC-001"
  psr_number: "P25002"
  expected_payment_date: "15/5/2026"
```

## 验证方案

1. **数据验证**: 对比手动计算的几个人薪酬，确认计算结果一致
2. **Excel 验证**: 打开生成的 Excel 文件，检查格式和数据
3. **PDF 验证**: 打开生成的 PDF 文件，与现有模板对比布局
4. **端到端测试**: 使用现有数据完整运行一次，对比总金额是否正确

## 关键文件

- 新建: `config.yaml`, `main.py`, `requirements.txt`
- 新建: `src/data_loader.py`, `src/salary_calculator.py`, `src/hr_matcher.py`
- 新建: `src/summary_sheet.py`, `src/individual_form.py`, `src/total_form.py`, `src/pdf_generator.py`
