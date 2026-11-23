import { formatKrw, formatPercent, formatUsdt, getNumberTone } from '../../../shared/format/numberFormat'
import type { AssetPremium } from '../kimchiPremium'
import type { QuoteFreshness } from '../quoteFreshness'
import type { TrackedAsset } from '../trackedAssets'

export interface PremiumTableRow {
  asset: TrackedAsset
  assetPremium: AssetPremium
  freshness: QuoteFreshness
}

interface PremiumTableProps {
  rows: readonly PremiumTableRow[]
  selectedAssetId: string
  onSelectAsset: (assetId: string) => void
}

/** 코인별 실시간 가격과 김프 목록. 코인을 누르면 위 요약과 차트가 그 코인으로 바뀐다. */
export function PremiumTable({ rows, selectedAssetId, onSelectAsset }: PremiumTableProps) {
  return (
    <section className="card premium-table-card" aria-labelledby="premium-table-title">
      <h2 id="premium-table-title" className="card-title">
        코인별 김치 프리미엄
      </h2>
      <div className="table-scroll">
        <table className="premium-table">
          <thead>
            <tr>
              <th scope="col">코인</th>
              <th scope="col" className="numeric">
                업비트 (KRW)
              </th>
              <th scope="col" className="numeric">
                바이낸스 (USDT)
              </th>
              <th scope="col" className="numeric optional-column">
                바이낸스 원화 환산
              </th>
              <th scope="col" className="numeric">
                김프
              </th>
              <th scope="col" className="numeric">
                테더 김프
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ asset, assetPremium, freshness }) => {
              const isSelected = asset.id === selectedAssetId
              return (
                <tr key={asset.id} className={isSelected ? 'selected' : undefined}>
                  <th scope="row">
                    <button
                      type="button"
                      className="asset-button"
                      aria-pressed={isSelected}
                      onClick={() => onSelectAsset(asset.id)}
                    >
                      <span className="asset-id">{asset.id}</span>
                      <span className="asset-name">{asset.displayName}</span>
                    </button>
                    {freshness === 'delayed' && <span className="badge badge-warning">지연</span>}
                  </th>
                  <td className="numeric">{formatKrw(assetPremium.domesticPriceInKrw)}</td>
                  <td className="numeric">{formatUsdt(assetPremium.foreignPriceInUsdt)}</td>
                  <td className="numeric optional-column">{formatKrw(assetPremium.foreignPriceInKrw)}</td>
                  <td className={`numeric strong tone-${getNumberTone(assetPremium.kimchiPremiumPercent)}`}>
                    {formatPercent(assetPremium.kimchiPremiumPercent)}
                  </td>
                  <td className={`numeric tone-${getNumberTone(assetPremium.tetherPremiumPercent)}`}>
                    {formatPercent(assetPremium.tetherPremiumPercent)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
