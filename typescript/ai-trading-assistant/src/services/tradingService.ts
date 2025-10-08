import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { executeUSDTToBNBSwap, executeBNBToUSDTSwap } from "./swapService";
import { fetchCurrentPrice } from "./coinGeckoService";
import "dotenv/config";

// USDT token address on BNB Chain
const USDT_TOKEN_ADDRESS = "0x55d398326f99059fF775485246999027B3197955";
const REQUIRED_USDT_AMOUNT = 1;
const REQUIRED_BNB_AMOUNT = 0.001;

/**
 * Get user's wallet address using MCP get_address_from_private_key tool
 * @param mcpClient The MCP client instance
 * @returns Promise<string> User's wallet address
 */
export async function getUserAddress(mcpClient: Client): Promise<string> {
  try {
    console.log("🔍 Getting user's wallet address...");

    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      throw new Error("PRIVATE_KEY not found in environment variables");
    }

    const result = await mcpClient.callTool({
      name: "get_address_from_private_key",
      arguments: {
        private_key: privateKey,
      },
    });

    if (!result.content) {
      throw new Error("No address data received");
    }

    // Handle the response - MCP returns an array with text objects
    let addressData;
    if (Array.isArray(result.content)) {
      // Extract the text from the first text object
      const textContent = result.content.find(
        (item) => item.type === "text"
      )?.text;
      if (!textContent) {
        throw new Error("No text content found in response");
      }
      addressData = JSON.parse(textContent);
    } else if (typeof result.content === "string") {
      addressData = JSON.parse(result.content);
    } else {
      addressData = result.content;
    }

    const address = addressData.address;

    if (!address) {
      throw new Error("No address found in response");
    }

    console.log(`✅ User address: ${address}`);
    return address;
  } catch (error) {
    console.error("Error getting user address:", error);
    throw error;
  }
}

/**
 * Check USDT balance using MCP get_erc20_balance tool
 * @param mcpClient The MCP client instance
 * @returns Promise<number> USDT balance
 */
export async function checkUSDTBalance(mcpClient: Client): Promise<number> {
  try {
    console.log("🔍 Checking USDT balance...");

    // First get the user's address
    const userAddress = await getUserAddress(mcpClient);

    const result = await mcpClient.callTool({
      name: "get_erc20_balance",
      arguments: {
        tokenAddress: USDT_TOKEN_ADDRESS,
        address: userAddress,
      },
    });

    if (!result.content) {
      throw new Error("No balance data received");
    }

    // Handle the response - MCP returns an array with text objects
    let balanceData;
    if (Array.isArray(result.content)) {
      // Extract the text from the first text object
      const textContent = result.content.find(
        (item) => item.type === "text"
      )?.text;
      if (!textContent) {
        throw new Error("No text content found in response");
      }
      balanceData = JSON.parse(textContent);
    } else if (typeof result.content === "string") {
      balanceData = JSON.parse(result.content);
    } else {
      balanceData = result.content;
    }

    const balance = parseFloat(
      balanceData.formatted || balanceData.balance || "0"
    );

    console.log(`✅ USDT Balance: ${balance}`);
    return balance;
  } catch (error) {
    console.error("Error checking USDT balance:", error);
    throw error;
  }
}

/**
 * Check BNB balance using MCP get_erc20_balance tool
 * @param mcpClient The MCP client instance
 * @returns Promise<number> BNB balance
 */
// export async function checkBNBBalance(mcpClient: Client): Promise<number> {
//   try {
//     console.log("🔍 Checking BNB balance...");

//     // First get the user's address
//     const userAddress = await getUserAddress(mcpClient);

//     const result = await mcpClient.callTool({
//       name: "get_erc20_balance",
//       arguments: {
//         tokenAddress: "BNB",
//         address: userAddress,
//       },
//     });

//     if (!result.content) {
//       throw new Error("No balance data received");
//     }

//     // Handle the response - MCP returns an array with text objects
//     let balanceData;
//     if (Array.isArray(result.content)) {
//       // Extract the text from the first text object
//       const textContent = result.content.find(
//         (item) => item.type === "text"
//       )?.text;
//       if (!textContent) {
//         throw new Error("No text content found in response");
//       }
//       balanceData = JSON.parse(textContent);
//     } else if (typeof result.content === "string") {
//       balanceData = JSON.parse(result.content);
//     } else {
//       balanceData = result.content;
//     }

//     const balance = parseFloat(
//       balanceData.formatted || balanceData.balance || "0"
//     );

//     console.log(`✅ BNB Balance: ${balance}`);
//     return balance;
//   } catch (error) {
//     console.error("Error checking BNB balance:", error);
//     throw error;
//   }
// }
export async function checkBNBBalance(mcpClient: Client): Promise<number> {
  try {
    console.log("🔍 Checking BNB balance...");

    // First get the user's address
    const userAddress = await getUserAddress(mcpClient);

    // const result = await mcpClient.callTool({
    //   name: "get_erc20_balance",
    //   arguments: {
    //     tokenAddress: "BNB",
    //     address: userAddress,
    //   },
    // });
    const result = await mcpClient.callTool({
      name: "get_native_balance",
      arguments: {
        address: userAddress,
      },
    });

    if (!result.content) {
      throw new Error("No balance data received");
    }

    // Handle the response - MCP returns an array with text objects
    let balanceData;
    if (Array.isArray(result.content)) {
      // Extract the text from the first text object
      const textContent = result.content.find(
        (item) => item.type === "text"
      )?.text;
      if (!textContent) {
        throw new Error("No text content found in response");
      }
      // Check if the text content is an error message
      if (textContent.startsWith("Error")) {
        throw new Error(textContent);
      }
      try {
        balanceData = JSON.parse(textContent);
      } catch (e) {
        throw new Error(`Failed to parse balance data: ${textContent}`);
      }
    } else if (typeof result.content === "string") {
      // Check if the string is an error message
      if (result.content.startsWith("Error")) {
        throw new Error(result.content);
      }
      try {
        balanceData = JSON.parse(result.content);
      } catch (e) {
        throw new Error(`Failed to parse balance data: ${result.content}`);
      }
    } else {
      balanceData = result.content;
    }

    const balance = parseFloat(
      balanceData.formatted || balanceData.balance || "0"
    );

    console.log(`✅ BNB Balance: ${balance}`);
    return balance;
  } catch (error) {
    console.error("Error checking BNB balance:", error);
    throw error;
  }
}

/**
 * Check if user has sufficient USDT balance for trading
 * @param mcpClient The MCP client instance
 * @returns Promise<{hasSufficientBalance: boolean, balance: number, message: string}>
 */
export async function checkTradingEligibility(mcpClient: Client): Promise<{
  hasSufficientBalance: boolean;
  usdtBalance: number;
  bnbBalance: number;
  message: string;
}> {
  try {
    const usdtBalance = await checkUSDTBalance(mcpClient);
    const bnbBalance = await checkBNBBalance(mcpClient);

    if (usdtBalance >= REQUIRED_USDT_AMOUNT && bnbBalance >= REQUIRED_BNB_AMOUNT) {
      return {
        hasSufficientBalance: true,
        usdtBalance,
        bnbBalance,
        message: `✅ You have sufficient USDT balance: ${usdtBalance.toFixed(
          4
        )} USDT and ${bnbBalance.toFixed(
          4
        )} BNB. You can proceed with the trade!`,
      };
    } else {
      return {
        hasSufficientBalance: false,
        usdtBalance,
        bnbBalance,
        message: `❌ Insufficient balance. You have ${usdtBalance.toFixed(
          4
        )} USDT and ${bnbBalance.toFixed(
          4
        )} BNB but need at least ${REQUIRED_USDT_AMOUNT} USDT and ${REQUIRED_BNB_AMOUNT}. Please reload your account.`,
      };
    }
  } catch (error) {
    return {
      hasSufficientBalance: false,
      usdtBalance: 0,
      bnbBalance: 0,
      message: `Error checking balance: ${error}`,
    };
  }
}

/**
 * Calculate optimal trade amount to maintain 50/50 allocation
 * @param mcpClient The MCP client instance
 * @returns Promise<{usdtAmount: number, bnbAmount: number}> Trade amounts
 */
export async function calculateOptimalTradeAmounts(
  usdtBalance: number,
  bnbBalance: number
): Promise<{ usdtAmount: number; bnbAmount: number }> {
  try {
    
    // Get current BNB price
    const bnbPrice = await fetchCurrentPrice("BNB");
    
    // Calculate total value in USDT
    const totalValue = usdtBalance + (bnbBalance * bnbPrice);
    
    // Calculate target value for each asset (50/50 split)
    const targetValue = totalValue / 2;
    
    // Calculate how much to trade
    const usdtTarget = targetValue;
    const bnbTarget = targetValue / bnbPrice;
    
    // Calculate difference from current holdings
    const usdtDiff = usdtTarget - usdtBalance;
    const bnbDiff = bnbTarget - bnbBalance;
    
    // If we have more USDT than target, we need to convert to BNB
    if (usdtDiff < 0) {
      return {
        usdtAmount: Math.abs(usdtDiff),
        bnbAmount: 0
      };
    }
    
    // If we have more BNB than target, we need to convert to USDT
    if (bnbDiff < 0) {
      return {
        usdtAmount: 0,
        bnbAmount: Math.abs(bnbDiff)
      };
    }
    
    // If we're balanced, no trade needed
    return {
      usdtAmount: 0,
      bnbAmount: 0
    };
  } catch (error) {
    console.error("Error calculating optimal trade amounts:", error);
    // Default to small trade if calculation fails
    return {
      usdtAmount: REQUIRED_USDT_AMOUNT,
      bnbAmount: 0
    };
  }
}

/**
 * Execute trade with 50/50 allocation strategy
 * @param mcpClient The MCP client instance
 * @param tokenSymbol The token to trade
 * @param amount The amount in USDT to trade with
 * @returns Promise<string> Trade result message
 */
export async function executeTrade(
  mcpClient: Client,
  tokenSymbol: string,
  decision: string
): Promise<string> {
  try {
    // First check balance
    const eligibility = await checkTradingEligibility(mcpClient);

    if (!eligibility.hasSufficientBalance) {
      return eligibility.message;
    }

    // If token is BNB, use 50/50 strategy
    if (tokenSymbol.toUpperCase() === "BNB") {
      // Calculate optimal trade amounts to maintain 50/50 allocation
      const tradeAmounts = await calculateOptimalTradeAmounts(eligibility.usdtBalance, eligibility.bnbBalance);
      
      // Use the calculated amounts for the trade
      const usdtAmount = tradeAmounts.usdtAmount;
      const bnbAmount = tradeAmounts.bnbAmount;
      
      console.log(
        `🚀 Executing trade for ${usdtAmount > 0 ? usdtAmount + ' USDT to BNB' : bnbAmount + ' BNB to USDT'}...`
      );

      // Get user's wallet address
      const userAddress = await getUserAddress(mcpClient);

      try {
        if (usdtAmount > 0 && decision === "BUY") {
          // Swap USDT to BNB
          console.log("📊 Fetching current BNB price for swap calculation...");
          const bnbPrice = await fetchCurrentPrice("BNB");

          // Execute the swap
          const receipt = await executeUSDTToBNBSwap(userAddress, usdtAmount, bnbPrice);

          return `✅ Trade executed successfully! You swapped ${usdtAmount} USDT for BNB.\n📝 Transaction hash: ${
            receipt.transactionHash
          }\n💰 Your new USDT balance: ${(eligibility.usdtBalance - usdtAmount).toFixed(
            2
          )} USDT`;
        } else if (bnbAmount > 0 && decision === "SELL") {
          // Swap BNB to USDT
          console.log("📊 Fetching current BNB price for swap calculation...");
          const bnbPrice = await fetchCurrentPrice("BNB");

          // Execute the swap
          const receipt = await executeBNBToUSDTSwap(userAddress, bnbAmount, bnbPrice);

          return `✅ Trade executed successfully! You swapped ${bnbAmount} BNB for USDT.\n📝 Transaction hash: ${
            receipt.transactionHash
          }\n💰 Your new BNB balance: ${(eligibility.bnbBalance - bnbAmount).toFixed(
            6
          )} BNB`;
        } else {
          return "No trade needed - balances are already optimal.";
        }
      } catch (swapError) {
        return `❌ Swap failed: ${swapError}. Please try again or check your network connection.`;
      }
    } else {
      return `❌ Trade failed: Unsupported token ${tokenSymbol}. Only BNB trades are supported with 50/50 allocation strategy.`;
    }
  } catch (error) {
    return `❌ Trade failed: ${error}`;
  }
}

/**
 * Get trading tool definition for OpenAI function calling
 * @returns Tool definition object
 */
export function getTradingToolDefinition() {
  return {
    type: "function" as const,
    function: {
      name: "executeTrade",
      description:
        "Execute a trade with USDT balance check. Checks if user has sufficient USDT balance before proceeding.",
      parameters: {
        type: "object",
        properties: {
          token: {
            type: "string",
            description: "The token symbol to trade (e.g., BNB, BTC, ETH)",
            enum: ["BNB", "BTC", "ETH", "SOL", "XRP", "ADA", "DOGE", "TRX"],
          },
          amount: {
            type: "number",
            description: "Amount in USDT to trade with (default: 10)",
            default: 10,
          },
        },
        required: ["token"],
      },
    },
  };
}

