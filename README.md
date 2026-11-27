# Kid Logic Lab｜國小學童專注力與邏輯訓練實驗室

[![Deploy to GitHub Pages](https://github.com/lucifer0427/kid-logic-lab/actions/workflows/deploy.yml/badge.svg)](https://github.com/lucifer0427/kid-logic-lab/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

> 專為 **6–12 歲國小學童** 打造的純靜態、零個資、離線優先（Offline-First PWA）認知專注力與邏輯訓練平台，收錄 **50 款分齡益智與執行功能訓練遊戲**，並針對 **教室 Chromebook / iPad 現場與家庭陪伴** 設計。

🌐 **線上立即遊玩**：[https://lucifer0427.github.io/kid-logic-lab/](https://lucifer0427.github.io/kid-logic-lab/)

---

## 核心設計原則（實證與防分心紅線）

1. **認知內在整合與近遷移定位**
   - 依發展心理學與認知訓練統合分析實證，將抑制控制、工作記憶更新、空間規劃與演繹排除直接內化為遊戲操作核心，誠實定位為「近遷移（Near Transfer）」訓練工具。
2. **反多巴胺陷阱與低認知負荷**
   - 嚴禁無關裝飾性粒子爆破、隨機抽卡獎勵與高壓倒數數字。
   - 改採 **視覺進度條（Visual Timer）**、柔和的 **五聲音階木琴音效** 與 **非干擾式微觀鷹架（Smart Hint）**，維持學童心流。
3. **色覺障礙友善與無文字低門檻**
   - 全面採用 **Okabe-Ito** 色盲友善調色盤，強制搭配**幾何形狀／主題圖示雙重編碼**（支援幾何實驗室／太空星際／森林昆蟲三套主題切換）。
   - 每款遊戲皆提供**無文字視覺引導（Interactive Tutorial）**，降低低年級學童的閱讀門檻。
4. **零個資隱私架構（COPPA 合規）**
   - 無後端伺服器、無追蹤 Cookie、無帳號登入；可選擇輸入純本機「探險家暱稱」，所有紀錄僅存於瀏覽器 `IndexedDB` 與 `localStorage`。
   - 支援 **URL 種子分享（`?game=...&seed=...&lvl=...`）**、**離線 SVG QR Code** 讓全班開啟同一題討論，以及 **單機 JSON 匯出／匯入完整備份**。

---

## 特色功能亮點

- **📚 50 款分齡與專題遊戲矩陣**：涵蓋低年級（16 款）、中年級（17 款）、高年級（17 款）及 **🌟 ADHD 專注特訓專區**（延遲等待、Flanker 側翼抗干擾、AX-CPT 持續警覺等）。
- **⚔️ 雙人對戰模式（免聯網、純靜態）**：
  - **同機即時搶答**：共用一台平板或電腦（觸控分區／鍵盤 `A` vs `L`），比拼反應速度與衝動抑制。
  - **同題輪流接力賽**：任選 50 款遊戲之一，兩人挑戰完全相同的種子題目並即時對比 ASI 與正確率。
  - **跨裝置好友 PK 連結**：過關後產生含成績與種子的 QR Code／連結，同學掃碼即可挑戰同一題。
- **🧭 每日大腦探險與里程碑徽章**：依當日日期產生每日 3 關任務與休息提醒，並以確定性能力里程碑解鎖 8 枚實驗室徽章。
- **📊 師長本地學習儀表板**：提供 **五軸認知雷達圖**（專注穩定 ASI、衝動抑制、工作記憶、演繹推論、策略規劃）、**近 15 次 ASI 與正確率趨勢折線圖**，以及反應時間變異係數（`CV_RT`）明細。

---

## 系統五層純前端架構

| 架構分層 | 對應模組路徑 | 核心職責與技術規範 |
| :--- | :--- | :--- |
| **第一層：表現與無障礙交互層** | `src/ui/` | Okabe-Ito 雙重編碼、iOS Safari 單一全域音訊解鎖、`VisualTimer`、`TutorialOverlay`、`QrModal` |
| **第二層：核心遊戲迴圈與 DDA** | `src/engine/` | `2-up 1-down` 階梯控制器（`staircase.ts`）、高斯模糊邏輯控制器（`fuzzyLogic.ts`） |
| **第三層：Web Worker PCG 與求解** | `src/worker/` | `Mulberry32` 確定性種子引擎、MRV 回溯求解器與唯一解驗證（6×6 / 9×9 數獨、拉丁方陣） |
| **第四層：本機遙測與分析引擎** | `src/telemetry/` | `performance.now()` 反應時間採樣、錯誤分類（Commission/Omission/Rule）、`CV_RT` 與 ASI 計算 |
| **第五層：零個資本地儲存與匯出** | `src/storage/` | `localStorage` 偏好與暱稱、`IndexedDB` 歷史紀錄、URL 種子分享、單機 JSON 備份還原 |

> [!NOTE]
> `src/telemetry/calibration.ts` 中的專注力穩定度指數（ASI）權重參數 $\alpha, \beta$ 為工程預設值，若進行正式教育研究或常模比較，建議依實地試測之學齡表現常模進行校準。

---

## 50 款遊戲一覽

<details>
<summary>點擊展開完整 50 款分齡遊戲清單</summary>

### 低年級（6–8 歲，16 款）
1. **分形節奏守護者** (`gonogo`) — 優勢反應抑制（Go/No-Go）
2. **雙屬性規則切換** (`dccsMaze`) — DCCS 顏色／形狀規則切換
3. **圖形拉丁方陣** (`latinSquare`) — 3×3 / 4×4 行列排除與智慧線索
4. **舒爾特視覺尋序** (`schulte`) — 3×3 至 5×5 數字與雙色交替尋序
5. **路徑記憶螢火蟲** (`fireflyMemory`) — Corsi 視覺空間序列記憶
6. **特徵聯集搜尋** (`conjunctionSearch`) — 顏色＋形狀雙維度選擇性注意
7. **鏡像對稱畫板** (`symmetryGrid`) — 左右鏡像心像翻轉
8. **圖形密碼破譯** (`mastermind`) — 假設驗證與 `● / ○` 線索推理
9. **耐心等待訊號** (`waitSignal`) — ADHD 延遲滿足與抗搶按訓練
10. **找出不一樣** (`oddOneOut`) — 顏色、形狀、大小分類歸納
11. **規律接龍列車** (`sequenceSort`) — `ABAB / AAB / ABC` 週期規律
12. **數量比一比** (`countCompare`) — 數量守恆與視覺估數
13. **時鐘小達人** (`clockMatch`) — 整點與半點類比時鐘判讀
14. **記憶翻牌配對** (`memoryPairs`) — 3×4 / 4×4 視覺短期記憶配對
15. **影子配對偵探** (`shadowMatch`) — 幾何剪影輪廓辨識
16. **步驟排順序** (`storyOrder`) — 生活情境時間因果序列化

### 中年級（8–10 歲，17 款）
17. **空間衝突方向判別** (`spatialConflict`) — Simon / Dots 抗位置干擾
18. **階梯式漢諾塔** (`hanoi`) — 3–5 層前瞻性規劃與最佳步數對照
19. **矩陣規律推演** (`matrixPattern`) — 2×2 / 3×3 幾何旋轉與數量歸納
20. **積木指令序列迷宮** (`blockMaze`) — 鑰匙開門、迴圈積木與碰撞標紅除錯
21. **點燈關燈謎題** (`lightsOut`) — 十字狀態翻轉與逆向推演
22. **推箱子迷宮** (`sokoban`) — 不可逆前瞻規劃與退回一步
23. **星塵純演繹掃雷** (`minesweeper`) — 首格安全＋局部約束插旗推論
24. **天平秤重推論** (`balanceScale`) — 具體運思期圖形等量代換
25. **魚群領袖方向** (`flankerFish`) — ADHD Eriksen Flanker 側翼抗干擾
26. **島嶼造橋連線** (`bridges`) — Hashiwokakero 不交叉單一網路規劃
27. **數字接龍路徑** (`pathFinder`) — 空間連續路徑規劃
28. **字母矩陣搜尋** (`wordSearch`) — 5×5 系統性視覺掃描
29. **分數披薩師傅** (`fractionPizza`) — 視覺分數比例建構
30. **雷射鏡面反射** (`mirrorMaze`) — 光路幾何反射規劃
31. **數字金字塔** (`numberPyramid`) — 逆向加減結構推算
32. **色彩擴散大師** (`colorFlood`) — 6×6 Flood Fill 全域覆蓋策略
33. **成語語詞重組** (`anagramSort`) — 四字成語工作記憶重組

### 高年級（10–12 歲，17 款）
34. **自適應 N-Back 工作記憶** (`nback`) — 1-Back 至 2-Back＋模糊邏輯平滑調速
35. **條件邏輯閘電路** (`logicGate`) — `AND / OR / XOR / NOT` 布林推導
36. **6×6 演繹數獨** (`sudoku6x6`) — Web Worker 唯一解＋筆記模式＋智慧線索
37. **9×9 進階數獨** (`sudoku9x9`) — 標準九宮格唯一解＋鍵盤導覽
38. **雙重邏輯矩陣** (`dualMatrix`) — 跨維度形狀、顏色、外框推演
39. **斑馬邏輯推論表** (`zebraPuzzle`) — 多維條件交叉排除法
40. **邏輯繪圖（數織）** (`nonogram`) — 5×5 數字線索填色揭曉像素畫
41. **二進位邏輯方陣** (`binaryPuzzle`) — Takuzu 6×6 `0 / 1` 約束推論
42. **目標算式 24 點** (`target24`) — 四則運算與括號拆解
43. **雙步線索巡邏員** (`axCpt`) — ADHD AX-CPT 持續警覺與脈絡維持
44. **騎士巡邏棋盤** (`knightTour`) — 5×5 日字步深度前瞻與回溯
45. **三維邏輯牌組（SET）** (`setMatch`) — 三維特徵「全同或全異」歸納
46. **質數獵人（篩法）** (`primeSieve`) — 2–29 質數篩選與因數排除
47. **凱撒密碼破譯** (`cipherBreak`) — 字母位移編解碼轉換
48. **數字消除（Hitori）** (`hitori`) — 不重複、不相鄰與白格單一連通驗證
49. **不等號數獨（Futoshiki）** (`futoshiki`) — 大小不等號傳遞演繹
50. **方塊拼圖填滿** (`polyominoFit`) — 4×4 旋轉心像與幾何組裝

</details>

---

## 本機開發與部署

### 環境需求
- Node.js 22+ / npm 10+

### 常用指令
```bash
# 安裝依賴
npm install

# 啟動本機開發伺服器
npm run dev

# 執行 Vitest 單元測試（PRNG、唯一解求解器、DDA、ASI 公式、遊戲核心不變量）
npm test

# TypeScript 嚴格型別檢查與 Vite + PWA 靜態打包
npm run build
```

### 自動部署（GitHub Pages）
本專案已配置 [.github/workflows/deploy.yml](file:///home/antigravity/lucifer0427/kid-logic-lab/.github/workflows/deploy.yml)，推送至 `main` 分支時將自動執行 `npm ci` → `npm test` → `npm run build` 並發布至 GitHub Pages。

---

## 授權條款

本專案採用 [MIT License](./LICENSE) 開源授權。
