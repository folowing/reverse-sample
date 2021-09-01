#include <fstream>
#include <string>

int main() {
  std::ifstream input_file("input.txt");
  std::string input;
  std::getline(input_file, input);
  std::string reversed(input.rbegin(), input.rend());
  std::ofstream output_file("output.txt");
  output_file << reversed;
  return 0;
}
