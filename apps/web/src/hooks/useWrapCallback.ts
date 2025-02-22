import { useTranslation } from '@pancakeswap/localization'
import { Currency, WNATIVE } from '@pancakeswap/sdk'
import tryParseAmount from '@pancakeswap/utils/tryParseAmount'
import useAccountActiveChain from 'hooks/useAccountActiveChain'
import { useMemo } from 'react'
import { useTransactionAdder } from 'state/transactions/hooks'
import { useCurrencyBalance } from 'state/wallet/hooks'
import { Hash } from 'viem'
import { useCallWithGasPrice } from './useCallWithGasPrice'
import { useWNativeContract } from './useContract'

export enum WrapType {
  NOT_APPLICABLE,
  WRAP,
  UNWRAP,
}

const NOT_APPLICABLE = { wrapType: WrapType.NOT_APPLICABLE }
/**
 * Given the selected input and output currency, return a wrap callback
 * @param inputCurrency the selected input currency
 * @param outputCurrency the selected output currency
 * @param typedValue the user input value
 */
export default function useWrapCallback(
  inputCurrency: Currency | undefined | null,
  outputCurrency: Currency | undefined | null,
  typedValue: string | undefined,
): { wrapType: WrapType; execute?: undefined | (() => Promise<{ hash?: Hash } | undefined>); inputError?: string } {
  const { t } = useTranslation()
  const { account, chainId } = useAccountActiveChain()
  const { callWithGasPrice } = useCallWithGasPrice()
  const wbnbContract = useWNativeContract()
  const balance = useCurrencyBalance(account ?? undefined, inputCurrency)
  // we can always parse the amount typed as the input currency, since wrapping is 1:1
  const inputAmount = useMemo(() => tryParseAmount(typedValue, inputCurrency), [inputCurrency, typedValue])
  const addTransaction = useTransactionAdder()

  return useMemo(() => {
    if (!wbnbContract || !chainId || !inputCurrency || !outputCurrency) return NOT_APPLICABLE

    const sufficientBalance = inputAmount && balance && !balance.lessThan(inputAmount)

    if (inputCurrency?.isNative && WNATIVE[chainId]?.equals(outputCurrency)) {
      return {
        wrapType: WrapType.WRAP,
        execute:
          sufficientBalance && inputAmount
            ? // eslint-disable-next-line consistent-return
              async () => {
                try {
                  const txReceipt = await callWithGasPrice(wbnbContract, 'deposit', undefined, {
                    value: inputAmount.quotient,
                  })
                  const amount = inputAmount.toSignificant(6)
                  const native = inputCurrency.symbol
                  const wrap = WNATIVE[chainId].symbol
                  addTransaction(txReceipt, {
                    summary: `Wrap ${amount} ${native} to ${wrap}`,
                    translatableSummary: { text: 'Wrap %amount% %native% to %wrap%', data: { amount, native, wrap } },
                    type: 'wrap',
                  })
                  return {
                    hash: txReceipt?.hash,
                  }
                } catch (error) {
                  console.error('Could not deposit', error)
                }
              }
            : undefined,
        inputError: sufficientBalance
          ? undefined
          : t('Insufficient %symbol% balance', { symbol: inputCurrency.symbol }),
      }
    }
    if (WNATIVE[chainId]?.equals(inputCurrency) && outputCurrency?.isNative) {
      return {
        wrapType: WrapType.UNWRAP,
        execute:
          sufficientBalance && inputAmount
            ? // eslint-disable-next-line consistent-return
              async () => {
                try {
                  const txReceipt = await callWithGasPrice(wbnbContract, 'withdraw', [inputAmount.quotient])
                  const amount = inputAmount.toSignificant(6)
                  const wrap = WNATIVE[chainId].symbol
                  const native = outputCurrency.symbol
                  addTransaction(txReceipt, {
                    summary: `Unwrap ${amount} ${wrap} to ${native}`,
                    translatableSummary: { text: 'Unwrap %amount% %wrap% to %native%', data: { amount, wrap, native } },
                  })
                  return {
                    hash: txReceipt?.hash,
                  }
                } catch (error) {
                  console.error('Could not withdraw', error)
                }
              }
            : undefined,
        inputError: sufficientBalance
          ? undefined
          : t('Insufficient %symbol% balance', { symbol: inputCurrency.symbol }),
      }
    }
    return NOT_APPLICABLE
  }, [wbnbContract, chainId, inputCurrency, outputCurrency, t, inputAmount, balance, addTransaction, callWithGasPrice])
}

export function useIsWrapping(
  currencyA: Currency | undefined | null,
  currencyB: Currency | undefined | null,
  value?: string,
) {
  const { wrapType } = useWrapCallback(currencyA, currencyB, value)

  return wrapType !== WrapType.NOT_APPLICABLE
}
